import io
import json
from unittest.mock import patch, MagicMock
import pytest

from app.common.models.licenses import License
from app.common.models.usage import UsageBalance, UsageRecord, UsageLedger
from app.common.enums import LicenseStatus, QuotaType, LedgerEntryType

SAMPLE_ID_CARD_JSON = {
    "document_type": "id_card",
    "card_type": "cccd_chip",
    "id_number": "001202012345",
    "full_name": "NGUYỄN VĂN AN",
    "date_of_birth": "1995-05-12",
    "gender": "Nam",
    "nationality": "Việt Nam",
    "place_of_origin": "Hà Nội",
    "place_of_residence": "Ba Đình, Hà Nội",
    "date_of_expiry": "2035-05-12",
    "date_of_issue": "2021-06-15",
    "issuing_authority": "Cục Cảnh sát QLHC về TTXH"
}

def mock_ollama_response(content_dict):
    mock_resp = MagicMock()
    mock_resp.status = 200
    resp_body = {
        "message": {
            "role": "assistant",
            "content": f"```json\n{json.dumps(content_dict)}\n```"
        }
    }
    mock_resp.read.return_value = json.dumps(resp_body).encode("utf-8")
    return mock_resp

def get_error_message(res_json):
    detail = res_json.get("detail")
    if isinstance(detail, dict):
        return detail.get("message", "")
    elif isinstance(detail, str):
        return detail
    return res_json.get("message", "")

def test_ocr_health_endpoint(client):
    with patch("urllib.request.urlopen") as mock_url:
        mock_r = MagicMock()
        mock_r.status = 200
        mock_url.return_value.__enter__.return_value = mock_r
        
        res = client.get("/api/v1/ocr/health")
        assert res.status_code == 200
        data = res.json()
        assert data["ollama_status"] == "running"
        assert data["active_model"] == "qwen2.5vl:7b"
        assert data["gpu_accelerated"] is True

def test_ocr_process_unauthorized(client):
    file_content = b"fake image content"
    res = client.post(
        "/api/v1/ocr/process-identity",
        files={"file": ("cccd.jpg", io.BytesIO(file_content), "image/jpeg")}
    )
    assert res.status_code == 401

def test_ocr_process_invalid_file_format(client, customer_one_token):
    file_content = b"some random text"
    res = client.post(
        "/api/v1/ocr/process-identity",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        files={"file": ("notes.txt", io.BytesIO(file_content), "text/plain")}
    )
    assert res.status_code == 400
    err_msg = get_error_message(res.json())
    assert "Định dạng tệp không được hỗ trợ" in err_msg

def test_ocr_process_no_active_license(client, customer_one_token):
    file_content = b"fake image bytes"
    res = client.post(
        "/api/v1/ocr/process-identity",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        files={"file": ("cccd.jpg", io.BytesIO(file_content), "image/jpeg")}
    )
    assert res.status_code == 400
    err_msg = get_error_message(res.json())
    assert "No active OCR License found" in err_msg

def test_ocr_process_with_jwt_and_quota_deduction(client, db, customer_one, customer_one_token):
    # 1. Purchase a package to obtain an active license and 1000 quota
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    order_id = order_res.json()["id"]

    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"}
    )
    assert checkout_res.status_code == 200
    license_id = checkout_res.json()["license_id"]

    # Verify initial quota
    balance = db.query(UsageBalance).filter(UsageBalance.license_id == license_id).first()
    assert balance.remaining_quota == 1000
    assert balance.used_quota == 0

    # 2. Process identity document with mock VLM
    fake_img = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)

        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cccd_chip.jpg", io.BytesIO(fake_img), "image/jpeg")},
            data={"license_id": license_id}
        )

    assert ocr_res.status_code == 200
    data = ocr_res.json()
    assert data["status"] == "completed"
    assert data["detected_type"] == "id_card"
    assert data["license_id"] == license_id
    assert data["quota_used"] == 1
    assert data["remaining_quota"] == 999
    assert data["extracted_data"]["id_number"] == "001202012345"
    assert data["extracted_data"]["full_name"] == "NGUYỄN VĂN AN"

    # 3. Verify Database state
    db.refresh(balance)
    assert balance.used_quota == 1
    assert balance.remaining_quota == 999

    # Check Usage Record
    record = db.query(UsageRecord).filter(UsageRecord.license_id == license_id).first()
    assert record is not None
    assert record.amount == 1
    assert record.user_id == customer_one.id

    # Check Usage Ledger debit entry
    debit_ledger = db.query(UsageLedger).filter(
        UsageLedger.license_id == license_id,
        UsageLedger.entry_type == LedgerEntryType.DEBIT_USAGE
    ).first()
    assert debit_ledger is not None
    assert debit_ledger.delta == -1
    assert debit_ledger.balance_after == 999

def test_ocr_process_with_api_key_header(client, db, customer_one, customer_one_token):
    # 1. Purchase license
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    order_id = order_res.json()["id"]

    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"}
    )
    license_id = checkout_res.json()["license_id"]

    # 2. Generate API Credential
    cred_res = client.post(
        f"/api/v1/licenses/{license_id}/credentials",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"name": "Production OCR Pipeline Key"}
    )
    assert cred_res.status_code == 201
    api_key = cred_res.json()["api_key"]

    # 3. Call OCR using X-API-Key header (no Bearer token)
    fake_img = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)

        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"X-API-Key": api_key},
            files={"file": ("passport_sample.jpg", io.BytesIO(fake_img), "image/jpeg")}
        )

    assert ocr_res.status_code == 200
    data = ocr_res.json()
    assert data["status"] == "completed"
    assert data["quota_used"] == 1
    assert data["remaining_quota"] == 999

def test_ocr_process_quota_exhausted(client, db, customer_one, customer_one_token):
    # 1. Purchase license
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    order_id = order_res.json()["id"]

    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"}
    )
    license_id = checkout_res.json()["license_id"]

    # Set remaining quota to 0 manually
    balance = db.query(UsageBalance).filter(UsageBalance.license_id == license_id).first()
    balance.remaining_quota = 0
    balance.used_quota = 1000
    db.commit()

    fake_img = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
    ocr_res = client.post(
        "/api/v1/ocr/process-identity",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        files={"file": ("driver_license.jpg", io.BytesIO(fake_img), "image/jpeg")},
        data={"license_id": license_id}
    )

    assert ocr_res.status_code == 400
    err_msg = get_error_message(ocr_res.json())
    assert "Hạn ngạch (Quota) của License" in err_msg
    assert "đã hết" in err_msg
