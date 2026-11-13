import io
import base64
import json
from unittest.mock import patch, MagicMock
from PIL import Image, ImageDraw
import pytest

from app.common.models.licenses import License
from app.common.models.usage import UsageBalance, UsageRecord, UsageLedger
from app.common.enums import LicenseStatus, QuotaType, LedgerEntryType

SAMPLE_ID_CARD_JSON = {
    "document_type": "id_card",
    "document_bbox": [150, 120, 850, 880],
    "card_subtype": "CCCD gắn chip",
    "id_number": "001202012345",
    "full_name": "NGUYỄN VĂN AN",
    "date_of_birth": "1995-05-12",
    "gender": "Nam",
    "nationality": "Việt Nam",
    "origin_address": "Hà Nội",
    "residence_address": "Ba Đình, Hà Nội",
    "expiry_date": "2035-05-12",
    "issue_date": "2021-06-15",
    "issue_place": "Cục Cảnh sát QLHC về TTXH"
}

def make_sample_id_with_background_bytes() -> bytes:
    """Create a synthetic image with a dark wooden-like background and a bright ID card in the center."""
    img = Image.new("RGB", (600, 400), color=(45, 35, 30))
    draw = ImageDraw.Draw(img)
    draw.rectangle([72, 60, 528, 340], fill=(235, 242, 245), outline=(180, 190, 200), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

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
        assert data["pipeline_mode"] == "hybrid"
        assert data["hybrid_llm_model"] == "qwen2.5:3b"
        assert data["active_model"] == "qwen2.5:3b"
        assert data["paddleocr_vl_model"] == "paddleocr-vl-vi"
        assert data["vietocr_ready"] is True
        assert data["rapidocr_ready"] is True
        assert data["gpu_accelerated"] is True
        model_names = [m["name"] for m in data["available_models"]]
        assert "qwen2.5:3b" in model_names
        assert "qwen2.5:1.5b" in model_names
        assert "paddleocr-vl-vi" in model_names
        assert "qwen3-vl:2b-instruct" in model_names
        assert "qwen2.5vl:3b" in model_names

def test_ocr_health_reports_paddleocr_vl_installed(client):
    def fake_urlopen(req, timeout=3):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        mock_r = MagicMock()
        mock_r.status = 200
        if url.endswith("/api/tags"):
            mock_r.read.return_value = json.dumps({
                "models": [{"name": "paddleocr-vl-vi:latest"}, {"name": "qwen2.5:3b"}]
            }).encode("utf-8")
        else:
            mock_r.read.return_value = b"Ollama is running"
        cm = MagicMock()
        cm.__enter__.return_value = mock_r
        return cm

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        res = client.get("/api/v1/ocr/health")
    assert res.status_code == 200
    data = res.json()
    assert data["paddleocr_vl_ready"] is True
    paddle_opt = next(m for m in data["available_models"] if m["name"] == "paddleocr-vl-vi")
    assert paddle_opt["installed"] is True

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

    # 2. Process identity document with background segmentation & mock VLM
    sample_img = make_sample_id_with_background_bytes()
    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)

        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cccd_chip.jpg", io.BytesIO(sample_img), "image/jpeg")},
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
    assert "document_bbox" not in data["extracted_data"]
    assert data["original_image_url"].startswith("data:image/jpeg;base64,")
    assert data["cropped_image_url"].startswith("data:image/jpeg;base64,")
    assert data["segmentation_info"] is not None
    assert data["segmentation_info"]["detected"] is True
    assert data["segmentation_info"]["original_dimensions"] == "600x400"
    assert data["segmentation_info"]["crop_area_ratio"] < 0.85

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
    sample_img = make_sample_id_with_background_bytes()
    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)

        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"X-API-Key": api_key},
            files={"file": ("passport_sample.jpg", io.BytesIO(sample_img), "image/jpeg")}
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

    sample_img = make_sample_id_with_background_bytes()
    ocr_res = client.post(
        "/api/v1/ocr/process-identity",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        files={"file": ("driver_license.jpg", io.BytesIO(sample_img), "image/jpeg")},
        data={"license_id": license_id}
    )

    assert ocr_res.status_code == 400
    err_msg = get_error_message(ocr_res.json())
    assert "Hạn ngạch (Quota) của License" in err_msg
    assert "đã hết" in err_msg

def test_ocr_cv_crop_and_rotate_before_vlm_and_custom_model(client, db, customer_one, customer_one_token):
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

    # Portrait image (400x600) with a vertical card (200x360) inside dark background -> CV must crop & rotate to landscape BEFORE VLM
    img = Image.new("RGB", (400, 600), color=(45, 35, 30))
    draw = ImageDraw.Draw(img)
    draw.rectangle([100, 120, 300, 480], fill=(235, 242, 245), outline=(180, 190, 200), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)

    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)
        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("vertical_cccd.jpg", io.BytesIO(buf.getvalue()), "image/jpeg")},
            data={"license_id": license_id, "model_name": "qwen3-vl:2b-instruct"}
        )

    assert ocr_res.status_code == 200
    data = ocr_res.json()
    assert data["segmentation_info"]["detected"] is True
    assert data["segmentation_info"]["rotation_applied_deg"] in (90, 270)

    sent_req = mock_url.call_args[0][0]
    sent_payload = json.loads(sent_req.data.decode("utf-8"))
    assert sent_payload["model"] == "qwen3-vl:2b-instruct"
    sent_img_bytes = base64.b64decode(sent_payload["messages"][1]["images"][0])
    with Image.open(io.BytesIO(sent_img_bytes)) as sent_img:
        # Must already be cropped (smaller than 400x600) and rotated upright (landscape: width > height)
        assert sent_img.size[0] > sent_img.size[1]
        assert sent_img.size[0] < 400


def test_docaligner_warp_perspective_and_corner_ordering():
    import numpy as np
    from app.modules.ocr_engine.service import (
        _order_quad_points,
        _validate_card_quad,
        _warp_card_perspective,
        preprocess_identity_document_cv,
    )

    # Unordered tilted quadrilateral card inside 800x600 frame
    pts = np.array([[580, 420], [190, 120], [160, 400], [600, 140]], dtype=np.float32)
    ordered = _order_quad_points(pts)
    assert ordered[0].tolist() == [190.0, 120.0]  # TL
    assert ordered[1].tolist() == [600.0, 140.0]  # TR
    assert ordered[2].tolist() == [580.0, 420.0]  # BR
    assert ordered[3].tolist() == [160.0, 400.0]  # BL
    assert _validate_card_quad(ordered, 800, 600) is True

    canvas = np.zeros((600, 800, 3), dtype=np.uint8)
    warped, bbox = _warp_card_perspective(canvas, ordered)
    assert warped.size[0] > warped.size[1]
    assert bbox == [160, 120, 600, 420]

    # Verify DocAligner runs cleanly via preprocess_identity_document_cv with mocked model polygon
    img_buf = io.BytesIO()
    Image.new("RGB", (800, 600), color=(30, 30, 30)).save(img_buf, format="JPEG")
    mock_model = MagicMock(return_value=np.array([[220, 160], [660, 180], [640, 440], [200, 420]], dtype=np.float32))
    with patch("app.modules.ocr_engine.service._get_docaligner_model", return_value=mock_model):
        _, _, out_bytes, meta, cv_cropped = preprocess_identity_document_cv(img_buf.getvalue())
    assert cv_cropped is True
    assert meta.detected is True
    assert "docaligner" in meta.method
    assert "warp" in meta.method
    assert meta.crop_area_ratio < 0.7

    # Large cropped card (>1280) must be downscaled cleanly within configured VLM cropped bounds
    large_buf = io.BytesIO()
    Image.new("RGB", (1600, 1200), color=(30, 30, 30)).save(large_buf, format="JPEG")
    large_mock = MagicMock(return_value=np.array([[100, 100], [1500, 100], [1500, 1000], [100, 1000]], dtype=np.float32))
    with patch("app.modules.ocr_engine.service._get_docaligner_model", return_value=large_mock):
        _, _, large_vlm_bytes, _, large_cropped = preprocess_identity_document_cv(large_buf.getvalue())
    assert large_cropped is True
    with Image.open(io.BytesIO(large_vlm_bytes)) as large_vlm_img:
        assert large_vlm_img.size[0] <= 1280
        assert large_vlm_img.size[1] <= 1280


def test_hybrid_row_sorting_and_postprocessing_guardrails():
    from app.modules.ocr_engine.service import (
        _format_ocr_rows_for_llm,
        _postprocess_hybrid_extracted_data,
    )

    # Box y1 differs by 5px on same row ("Quê quán:" y1=382 vs "Xuân Vinh" y1=377): must stay on same row left->right
    lines = [
        {"bbox": [545, 377, 684, 415], "text": "Xuân Vinh"},
        {"bbox": [303, 382, 416, 416], "text": "Quê quán:"},
        {"bbox": [454, 411, 769, 445], "text": "Xuân Trường, Nam Định"},
        {"bbox": [24, 461, 310, 495], "text": "Có giá trị đến: Không thời hạn"},
    ]
    formatted = _format_ocr_rows_for_llm(lines)
    row_lines = formatted.splitlines()
    assert len(row_lines) == 3
    assert "[x=303..416] Quê quán: | [x=545..684] Xuân Vinh" in row_lines[0]

    # Guardrails prevent hallucinated issue_place / issue_date and recover Không thời hạn + DD/MM/YYYY
    llm_out = {
        "document_type": "id_card",
        "date_of_birth": "1958-06-28",
        "nationality": "Kinh",
        "issue_date": "2020-01-01",
        "issue_place": "Cục Cảnh sát QLHC",
        "expiry_date": None,
    }
    raw_lines = [
        {"bbox": [230, 220, 510, 253], "text": "Ngày, tháng, năm sinh: 28/06/1958"},
        {"bbox": [230, 250, 400, 280], "text": "Dân tộc: Kinh"},
        {"bbox": [24, 360, 310, 415], "text": "Có giá trị đến: Không thời hạn"},
    ]
    cleaned = _postprocess_hybrid_extracted_data(llm_out, raw_lines)
    assert cleaned["issue_place"] is None
    assert cleaned["issue_date"] is None
    assert cleaned["expiry_date"] == "Không thời hạn"
    assert cleaned["date_of_birth"] == "28/06/1958"
    assert cleaned["nationality"] is None


def test_paddleocr_vl_id_refinement_and_strip_extraction():
    import numpy as np
    from app.modules.ocr_engine.service import (
        _find_suspicious_id_line_index,
        _extract_text_lines_paddleocr_vl,
    )

    assert _find_suspicious_id_line_index(["CỘNG HÒA", "Số: 079186004446", "Họ tên: ABC"]) is None
    assert _find_suspicious_id_line_index(["CỘNG HÒA", "GIẤY CMND", "số 3520228/6", "Họ tên: MUM"]) == 2
    assert _find_suspicious_id_line_index(["CỘNG HÒA", "GIẤY CMND", "số 35202286", "Họ tên: MUM"]) == 2

    sample_img = make_sample_id_with_background_bytes()
    fake_bgr = np.full((300, 500, 3), 240, dtype=np.uint8)
    fake_boxes = [
        {"bbox": [50, 20, 400, 45], "crop_rgb": np.full((25, 350, 3), 255, dtype=np.uint8)},
        {"bbox": [180, 95, 360, 125], "crop_rgb": np.full((30, 180, 3), 255, dtype=np.uint8)},
        {"bbox": [150, 140, 420, 170], "crop_rgb": np.full((30, 270, 3), 255, dtype=np.uint8)},
    ]

    with patch("app.modules.ocr_engine.service._detect_text_boxes_bgr", return_value=(fake_bgr, fake_boxes, 42.5)), \
         patch(
             "app.modules.ocr_engine.service._call_paddleocr_vl_ollama",
             side_effect=[
                 "GIẤY CHỨNG MINH NHÂN DÂN\nsố 3520228/6\nHọ tên: NGUYỄN THỊ MUM",
                 "SỐ 352022846",
             ],
         ) as mock_call:
        ocr_lines, det_ms, paddle_ms = _extract_text_lines_paddleocr_vl(sample_img)

    assert det_ms == 42.5
    assert paddle_ms >= 0.0
    assert mock_call.call_count == 2
    assert [ln["text"] for ln in ocr_lines] == [
        "GIẤY CHỨNG MINH NHÂN DÂN",
        "SỐ 352022846",
        "Họ tên: NGUYỄN THỊ MUM",
    ]


def test_ocr_hybrid_pipeline_api_text_only_payload(client, customer_one_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post("/api/v1/orders", headers={"Authorization": f"Bearer {customer_one_token}"}, json={"package_version_id": version_id}).json()["id"]
    license_id = client.post(f"/api/v1/orders/{order_id}/checkout", headers={"Authorization": f"Bearer {customer_one_token}"}, json={"payment_method": "mock_card"}).json()["license_id"]

    sample_img = make_sample_id_with_background_bytes()
    fake_lines = [{"bbox": [100, 120, 400, 150], "text": "036086002764"}]
    with patch("app.modules.ocr_engine.service._extract_text_lines_vietocr", return_value=(fake_lines, 240.0, 2800.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response({
            "document_type": "id_card",
            "id_number": "036086002764",
            "full_name": "ĐOÀN KHÁNH CHI",
            "issue_place": "Bịa ra",
        })
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cccd.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id, "pipeline_mode": "hybrid"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["segmentation_info"]["pipeline_mode"] == "hybrid"
    assert body["segmentation_info"]["ocr_lines_count"] == 1
    assert body["segmentation_info"]["stage_timings_ms"]["vietocr_ms"] == 2800.0
    assert body["extracted_data"]["issue_place"] is None
    sent_payload = json.loads(mock_url.call_args[0][0].data.decode("utf-8"))
    assert sent_payload["model"] == "qwen2.5:3b"
    assert "images" not in sent_payload["messages"][1]


def test_ocr_hybrid_paddle_vl_pipeline_api_and_model_routing(client, customer_one_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post("/api/v1/orders", headers={"Authorization": f"Bearer {customer_one_token}"}, json={"package_version_id": version_id}).json()["id"]
    license_id = client.post(f"/api/v1/orders/{order_id}/checkout", headers={"Authorization": f"Bearer {customer_one_token}"}, json={"payment_method": "mock_card"}).json()["license_id"]

    sample_img = make_sample_id_with_background_bytes()
    fake_lines = [
        {"bbox": [0, 0, 100, 18], "text": "SỐ 352022846"},
        {"bbox": [0, 20, 100, 38], "text": "Họ tên: NGUYỄN THỊ MUM"},
    ]
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 310.0, 5200.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response({
            "document_type": "id_card",
            "card_subtype": "CMND",
            "id_number": "352022846",
            "full_name": "NGUYỄN THỊ MUM",
            "issue_place": "Công an An Giang",
        })
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cmnd.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id, "pipeline_mode": "hybrid_paddle_vl", "model_name": "qwen2.5:1.5b"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["segmentation_info"]["pipeline_mode"] == "hybrid_paddle_vl"
    assert body["segmentation_info"]["ocr_lines_count"] == 2
    assert body["segmentation_info"]["stage_timings_ms"]["paddleocr_vl_ms"] == 5200.0
    assert body["extracted_data"]["id_number"] == "352022846"
    assert body["extracted_data"]["issue_place"] is None
    sent_payload = json.loads(mock_url.call_args[0][0].data.decode("utf-8"))
    assert sent_payload["model"] == "qwen2.5:1.5b"
    assert "images" not in sent_payload["messages"][1]

    # Also verify direct model_name='paddleocr-vl-vi' routes through hybrid_paddle_vl with OLLAMA_TEXT_MODEL
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 300.0, 4800.0)) as mock_extract, \
         patch("urllib.request.urlopen") as mock_url2:
        mock_url2.return_value.__enter__.return_value = mock_ollama_response({
            "document_type": "id_card",
            "id_number": "352022846",
            "full_name": "NGUYỄN THỊ MUM",
        })
        res2 = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cmnd.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id, "model_name": "paddleocr-vl-vi"},
        )

    assert res2.status_code == 200
    assert mock_extract.call_args.kwargs["paddle_model"] == "paddleocr-vl-vi"
    assert res2.json()["segmentation_info"]["pipeline_mode"] == "hybrid_paddle_vl"
    sent_payload2 = json.loads(mock_url2.call_args[0][0].data.decode("utf-8"))
    assert sent_payload2["model"] == "qwen2.5:3b"
