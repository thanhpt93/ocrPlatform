import io
import base64
import json
from unittest.mock import patch, MagicMock
from PIL import Image, ImageDraw
import pytest

from app.common.models.licenses import License
from app.common.models.usage import UsageBalance, UsageRecord, UsageLedger
from app.common.enums import LicenseStatus, QuotaType, LedgerEntryType

@pytest.fixture(autouse=True)
def _isolate_ocr_storage_dir(tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "OCR_STORAGE_DIR", str(tmp_path / "ocr_jobs"))


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
        assert data["pipeline_mode"] == "hybrid_paddle_vl"
        assert data["hybrid_llm_model"] == "qwen2.5:3b"
        assert data["active_model"] == "qwen2.5:3b"
        assert data["paddleocr_vl_model"] == "paddleocr-vl-vi"
        assert "vietocr_ready" not in data
        assert data["rapidocr_ready"] is True
        assert data["gpu_accelerated"] is True
        model_names = [m["name"] for m in data["available_models"]]
        assert "qwen2.5:3b" in model_names
        assert "qwen2.5:1.5b" not in model_names
        assert "paddleocr-vl-vi" in model_names
        assert "qwen2.5vl:7b" not in model_names
        assert "qwen2.5vl:3b" not in model_names
        assert "qwen3-vl:2b-instruct" not in model_names

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
    assert data["extracted_data"]["id_number"] == "001202012345"
    assert data["extracted_data"]["full_name"] == "NGUYỄN VĂN AN"

    # 4. Verify credential last_used_at was updated
    creds_list_res = client.get(
        f"/api/v1/licenses/{license_id}/credentials",
        headers={"Authorization": f"Bearer {customer_one_token}"},
    )
    assert creds_list_res.status_code == 200
    creds = creds_list_res.json()
    assert len(creds) == 1
    assert creds[0]["last_used_at"] is not None

    # 5. Verify job submitted via external X-API-Key appears in web history & usage summary
    jobs_res = client.get(
        "/api/v1/ocr/jobs",
        headers={"Authorization": f"Bearer {customer_one_token}"},
    )
    assert jobs_res.status_code == 200
    jobs = jobs_res.json()
    matched = [j for j in jobs if j["job_id"] == data["job_id"]]
    assert len(matched) == 1
    assert matched[0]["file_name"] == "passport_sample.jpg"
    assert matched[0]["extracted_data"]["id_number"] == "001202012345"

    summary_res = client.get(
        "/api/v1/usage/summary",
        headers={"Authorization": f"Bearer {customer_one_token}"},
    )
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["total_jobs"] >= 1
    assert summary["used_quota"] == 1

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

    fake_lines = [{"bbox": [10, 10, 180, 35], "text": "Số / No.: 001202012345"}]
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 110.0, 950.0)) as mock_extract, \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)
        ocr_res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("vertical_cccd.jpg", io.BytesIO(buf.getvalue()), "image/jpeg")},
            data={"license_id": license_id, "model_name": "qwen2.5:3b"}
        )

    assert ocr_res.status_code == 200
    data = ocr_res.json()
    assert data["segmentation_info"]["detected"] is True
    assert data["segmentation_info"]["rotation_applied_deg"] in (90, 270)

    sent_img_bytes = mock_extract.call_args[0][0]
    with Image.open(io.BytesIO(sent_img_bytes)) as sent_img:
        # Must already be cropped (smaller than 400x600) and rotated upright (landscape: width > height)
        assert sent_img.size[0] > sent_img.size[1]
        assert sent_img.size[0] < 400

    sent_req = mock_url.call_args[0][0]
    sent_payload = json.loads(sent_req.data.decode("utf-8"))
    assert sent_payload["model"] == "qwen2.5:3b"
    assert "images" not in sent_payload["messages"][1]


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
        _sort_ocr_lines_y_center,
        _format_paddle_ocr_lines_for_llm,
        _postprocess_hybrid_extracted_data,
    )

    # Box y1 differs by 5px on same row ("Quê quán:" y1=382 vs "Xuân Vinh" y1=377): must stay on same row left->right
    lines = [
        {"bbox": [545, 377, 684, 415], "text": "Xuân Vinh"},
        {"bbox": [303, 382, 416, 416], "text": "Quê quán:"},
        {"bbox": [454, 411, 769, 445], "text": "Xuân Trường, Nam Định"},
        {"bbox": [24, 461, 310, 495], "text": "Có giá trị đến: Không thời hạn"},
    ]
    grouped_rows = _sort_ocr_lines_y_center(lines)
    assert len(grouped_rows) == 3
    assert [it["text"] for it in grouped_rows[0]] == ["Quê quán:", "Xuân Vinh"]
    formatted = _format_paddle_ocr_lines_for_llm([it for row in grouped_rows for it in row])
    assert formatted.splitlines()[0] == "L01: Quê quán:"

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
    assert cleaned["card_side"] == "front"
    assert "issue_place" not in cleaned
    assert "issue_date" not in cleaned
    assert cleaned["expiry_date"] == "Không thời hạn"
    assert cleaned["date_of_birth"] == "28/06/1958"
    assert cleaned["nationality"] is None


def test_hybrid_row_sorting_separates_bottom_left_expiry_from_residence():
    from app.modules.ocr_engine.service import (
        _sort_ocr_lines_y_center,
        _postprocess_hybrid_extracted_data,
    )

    # Simulate 1120x706 CCCD layout where bottom-left 'Date of expiry' shares y-band with bottom-right residence line 2
    boxes = [
        {"bbox": [323, 173, 852, 224], "text": "CĂN CƯỚC CÔNG DÂN"},
        {"bbox": [320, 300, 803, 348], "text": "Số / No.: 001167016161"},
        {"bbox": [320, 386, 674, 433], "text": "NGUYỄN THỊ LỰU"},
        {"bbox": [318, 509, 946, 561], "text": "Quê quán / Place of origin: Tiền Yên, Hoài Đức"},
        {"bbox": [318, 554, 435, 595], "text": "Hà Nội"},
        {"bbox": [313, 577, 957, 644], "text": "Nơi thường trú / Place of residence: Thôn Tiền Lệ"},
        {"bbox": [26, 605, 176, 645], "text": "Có giá trị đến:"},
        {"bbox": [29, 636, 144, 662], "text": "Date of expiry"},
        {"bbox": [319, 633, 760, 679], "text": "Tiền Yên, Hoài Đức, Hà Nội"},
        {"bbox": [60, 648, 213, 687], "text": "01/01/2027"},
    ]
    rows = _sort_ocr_lines_y_center(boxes, img_width=1120, img_height=706)
    row_texts = [[it["text"] for it in row] for row in rows]
    assert row_texts[5] == ["Nơi thường trú / Place of residence: Thôn Tiền Lệ"]
    assert row_texts[6] == ["Tiền Yên, Hoài Đức, Hà Nội"]
    assert row_texts[7] == ["Có giá trị đến:"]
    assert row_texts[8] == ["Date of expiry"]
    assert row_texts[9] == ["01/01/2027"]

    cleaned = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "residence_address": "Nơi thường trù / Place of residence: Thôn Tiền Lệ, Tiền Yên, Hoài Đức, Hà Nội",
            "origin_address": "Place of origin: Tiền Yên, Hoài Đức, Hà Nội",
        },
        [{"bbox": [0, 0, 100, 20], "text": "Nơi thường trú"}],
    )
    assert cleaned["residence_address"] == "Thôn Tiền Lệ, Tiền Yên, Hoài Đức, Hà Nội"
    assert cleaned["origin_address"] == "Tiền Yên, Hoài Đức, Hà Nội"


def test_get_ollama_base_url_normalizes_localhost_to_ipv4(monkeypatch):
    from app.core.config import settings
    from app.modules.ocr_engine.service import _get_ollama_base_url

    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434/")
    assert _get_ollama_base_url() == "http://127.0.0.1:11434"

    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://192.168.1.50:11434/")
    assert _get_ollama_base_url() == "http://192.168.1.50:11434"


def test_auto_upright_prefers_text_orientation_over_skin_red_tint():
    from app.modules.ocr_engine.service import _auto_upright_cropped_card

    # Portrait card whose right edge (becomes top in rot_270_cw) has a bright skin/reddish region,
    # while rot_90_cw has upright text according to _detect_text_orientation_vote.
    portrait = Image.new("RGB", (400, 640), color=(220, 235, 240))
    arr = portrait.load()
    for x in range(280, 390):
        for y in range(60, 260):
            arr[x, y] = (185, 130, 120)  # skin-like warm tone

    with patch("app.modules.ocr_engine.service._detect_text_orientation_vote", return_value=(32.0, 2.5, 10)):
        out_p, deg_p = _auto_upright_cropped_card(portrait)
    assert deg_p == 90
    assert out_p.size == (640, 400)

    # Upside-down landscape card must rotate 180° when text_cls vote strongly indicates 180°
    landscape = Image.new("RGB", (640, 400), color=(220, 235, 240))
    with patch("app.modules.ocr_engine.service._detect_text_orientation_vote", return_value=(3.0, 35.0, 12)):
        out_l, deg_l = _auto_upright_cropped_card(landscape)
    assert deg_l == 180
    assert out_l.size == (640, 400)


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
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 240.0, 2800.0)), \
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
            data={"license_id": license_id},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["segmentation_info"]["pipeline_mode"] == "hybrid_paddle_vl"
    assert body["segmentation_info"]["ocr_lines_count"] == 1
    assert body["segmentation_info"]["stage_timings_ms"]["paddleocr_vl_ms"] == 2800.0
    assert body["extracted_data"]["card_side"] == "front"
    assert "issue_place" not in body["extracted_data"]
    assert "issue_date" not in body["extracted_data"]
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
            data={"license_id": license_id, "model_name": "qwen2.5:3b"},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["segmentation_info"]["pipeline_mode"] == "hybrid_paddle_vl"
    assert body["segmentation_info"]["ocr_lines_count"] == 2
    assert body["segmentation_info"]["stage_timings_ms"]["paddleocr_vl_ms"] == 5200.0
    assert body["extracted_data"]["id_number"] == "352022846"
    assert body["extracted_data"]["card_subtype"] == "CMND"
    assert body["extracted_data"]["card_side"] == "front"
    assert "issue_place" not in body["extracted_data"]
    sent_payload = json.loads(mock_url.call_args[0][0].data.decode("utf-8"))
    assert sent_payload["model"] == "qwen2.5:3b"
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


def test_ocr_jobs_persistence_and_secure_image_serving(
    client, db, customer_one, customer_one_token, customer_two_token, admin_token
):
    import pathlib
    from app.core.config import settings
    from app.common.models.ocr_jobs import OCRJobRecord

    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    sample_img = make_sample_id_with_background_bytes()
    fake_lines = [{"bbox": [10, 10, 200, 35], "text": "Số / No.: 001202012345"}]
    job_ids = []
    for fname in ("first_cccd.jpg", "second_cccd.jpg"):
        with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 100.0, 900.0)), \
             patch("urllib.request.urlopen") as mock_url:
            mock_url.return_value.__enter__.return_value = mock_ollama_response(SAMPLE_ID_CARD_JSON)
            res = client.post(
                "/api/v1/ocr/process-identity",
                headers={"Authorization": f"Bearer {customer_one_token}"},
                files={"file": (fname, io.BytesIO(sample_img), "image/jpeg")},
                data={"license_id": license_id},
            )
        assert res.status_code == 200
        job_ids.append(res.json()["job_id"])

    # Verify DB + disk storage
    storage_root = pathlib.Path(settings.OCR_STORAGE_DIR)
    for jid in job_ids:
        rec = db.query(OCRJobRecord).filter(OCRJobRecord.job_id == jid).first()
        assert rec is not None
        assert rec.user_id == customer_one.id
        assert (storage_root / jid / "original.jpg").is_file()
        assert (storage_root / jid / "cropped.jpg").is_file()

    # User 1 lists jobs (newest first)
    list_res = client.get("/api/v1/ocr/jobs", headers={"Authorization": f"Bearer {customer_one_token}"})
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 2
    assert items[0]["job_id"] == job_ids[1]
    assert items[1]["job_id"] == job_ids[0]
    assert items[0]["file_name"] == "second_cccd.jpg"
    assert items[0]["extracted_data"]["id_number"] == "001202012345"
    assert items[0]["original_image_url"].startswith(f"/api/v1/ocr/jobs/{job_ids[1]}/image/original?t=")
    assert items[0]["cropped_image_url"].startswith(f"/api/v1/ocr/jobs/{job_ids[1]}/image/cropped?t=")

    # User 2 cannot see User 1's jobs
    other_list = client.get("/api/v1/ocr/jobs", headers={"Authorization": f"Bearer {customer_two_token}"})
    assert other_list.status_code == 200
    assert other_list.json() == []

    # Image serving auth checks
    signed_orig_url = items[0]["original_image_url"]
    base_cropped_url = f"/api/v1/ocr/jobs/{job_ids[1]}/image/cropped"
    assert client.get(signed_orig_url).status_code == 200
    assert client.get(signed_orig_url).headers["content-type"].startswith("image/jpeg")
    assert client.get(base_cropped_url).status_code == 401
    assert client.get(base_cropped_url, headers={"Authorization": f"Bearer {customer_two_token}"}).status_code == 403
    assert client.get(f"{base_cropped_url}?t=wrong-token").status_code == 403
    assert client.get(base_cropped_url, headers={"Authorization": f"Bearer {customer_one_token}"}).status_code == 200
    assert client.get(base_cropped_url, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200
    assert client.get(f"/api/v1/ocr/jobs/{job_ids[1]}/image/invalid", headers={"Authorization": f"Bearer {customer_one_token}"}).status_code == 400


def test_real_model_confidence_from_logprobs_and_refinement(client, db, customer_one_token):
    import math
    from app.modules.ocr_engine.service import (
        _compute_confidence_from_logprobs,
        _extract_text_lines_paddleocr_vl,
    )

    # 1. Unit check on logprob -> probability % calculation (ignores newline-only tokens)
    conf, cnt = _compute_confidence_from_logprobs([
        {"token": "A", "logprob": math.log(0.90)},
        {"token": "\n", "logprob": math.log(0.10)},
        {"token": "B", "logprob": math.log(0.80)},
    ])
    assert cnt == 2
    assert conf == 85.0

    # 2. Verify end-to-end process-identity computes weighted 80% PaddleOCR-VL + 20% LLM confidence
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    sample_img = make_sample_id_with_background_bytes()
    fake_lines = [
        {"bbox": [10, 10, 200, 35], "text": "Số / No.: 001202012345", "confidence": 90.0, "token_count": 4},
        {"bbox": [10, 40, 240, 65], "text": "NGUYỄN VĂN AN", "confidence": 80.0, "token_count": 4},
    ]
    llm_mock_resp = MagicMock()
    llm_mock_resp.status = 200
    llm_mock_resp.read.return_value = json.dumps({
        "message": {"role": "assistant", "content": json.dumps(SAMPLE_ID_CARD_JSON)},
        "logprobs": [
            {"token": "{", "logprob": math.log(1.0)},
            {"token": "001202012345", "logprob": math.log(0.90)},
        ],
    }).encode("utf-8")

    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 100.0, 900.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = llm_mock_resp
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cccd_real_conf.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id},
        )

    assert res.status_code == 200
    body = res.json()
    # OCR mean = (90*4 + 80*4)/8 = 85.0; LLM mean = (100 + 90)/2 = 95.0; combined = 0.8*85 + 0.2*95 = 87.0
    assert body["confidence_score"] == 87.0
    assert body["segmentation_info"]["ocr_confidence"] == 85.0
    assert body["segmentation_info"]["llm_confidence"] == 95.0
    assert body["segmentation_info"]["confidence_source"] == "model_logprobs"

    # Verify persisted job history returns real score instead of 99.2
    jobs = client.get("/api/v1/ocr/jobs", headers={"Authorization": f"Bearer {customer_one_token}"}).json()
    matched = [j for j in jobs if j["job_id"] == body["job_id"]]
    assert len(matched) == 1
    assert matched[0]["confidence_score"] == 87.0


def test_per_field_confidence_from_ocr_tokens_and_llm_json_logprobs(client, customer_one_token):
    import math
    from app.modules.ocr_engine.service import _extract_llm_field_confidences

    # 1. Verify exact JSON value span logprob extraction
    llm_tokens = [
        ('{"document_type": "', math.log(1.0)),
        ("id_card", math.log(0.95)),
        ('", "id_number": "', math.log(1.0)),
        ("086187", math.log(0.90)),
        ("000717", math.log(1.0)),
        ('", "full_name": "', math.log(1.0)),
        ("NGUYỄN VĂN AN", math.log(0.80)),
        ('", "issue_date": null}', math.log(1.0)),
    ]
    llm_logprobs = [{"token": t, "logprob": lp} for t, lp in llm_tokens]
    field_llm = _extract_llm_field_confidences(llm_logprobs)
    assert field_llm["document_type"] == 95.0
    assert field_llm["id_number"] == 95.0  # 6 chars @90% + 6 chars @100%
    assert field_llm["full_name"] == 80.0
    assert "issue_date" not in field_llm

    # 2. Verify end-to-end per-field confidence combines 80% PaddleOCR-VL token span + 20% LLM field value
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    fake_lines = [
        {
            "bbox": [10, 10, 200, 35],
            "text": "Số: 086187000717",
            "confidence": 90.0,
            "token_count": 3,
            "tokens": [("Số: ", 99.0), ("086187", 80.0), ("000717", 100.0)],
        },
        {
            "bbox": [10, 40, 240, 65],
            "text": "NGUYỄN VĂN AN",
            "confidence": 75.0,
            "token_count": 2,
            "tokens": [("NGUYỄN VĂN ", 70.0), ("AN", 95.0)],
        },
    ]
    llm_raw = "".join(t for t, _ in llm_tokens)
    llm_resp = MagicMock()
    llm_resp.status = 200
    llm_resp.read.return_value = json.dumps({
        "message": {"role": "assistant", "content": llm_raw},
        "logprobs": llm_logprobs,
    }).encode("utf-8")

    sample_img = make_sample_id_with_background_bytes()
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(fake_lines, 80.0, 700.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = llm_resp
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cccd_field_conf.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id},
        )

    assert res.status_code == 200
    body = res.json()
    fc = body["field_confidences"]
    assert fc["document_type"] == 95.0
    # id_number: OCR=(80*6 + 100*6)/12=90.0, LLM=95.0 -> 0.8*90 + 0.2*95 = 91.0
    assert fc["id_number"] == 91.0
    # full_name: OCR=(70*11 + 95*2)/13=73.85, LLM=80.0 -> 0.8*73.85 + 0.2*80 = 75.08
    assert abs(fc["full_name"] - 75.08) < 0.05
    assert body["segmentation_info"]["field_confidences"] == fc

    jobs = client.get("/api/v1/ocr/jobs", headers={"Authorization": f"Bearer {customer_one_token}"}).json()
    matched = [j for j in jobs if j["job_id"] == body["job_id"]]
    assert matched[0]["field_confidences"] == fc


def test_lossless_png_intermediate_encoding():
    from app.modules.ocr_engine.service import (
        normalize_image_bytes,
        _encode_vlm_image_bytes,
        _encode_preview_data_url,
        _call_paddleocr_vl_ollama,
    )

    sample_jpg = make_sample_id_with_background_bytes()
    norm_bytes = normalize_image_bytes(sample_jpg)
    with Image.open(io.BytesIO(norm_bytes)) as norm_img:
        assert norm_img.format == "PNG"

    vlm_bytes = _encode_vlm_image_bytes(Image.new("RGB", (600, 380), color=(240, 240, 240)), max_dimension=1280)
    with Image.open(io.BytesIO(vlm_bytes)) as vlm_img:
        assert vlm_img.format == "PNG"

    # Preview data URL intentionally stays JPEG for lightweight UI/storage
    assert _encode_preview_data_url(Image.new("RGB", (200, 120))).startswith("data:image/jpeg;base64,")

    fake_resp = MagicMock()
    fake_resp.status = 200
    fake_resp.read.return_value = json.dumps({"message": {"content": "TEST"}}).encode("utf-8")
    with patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = fake_resp
        _call_paddleocr_vl_ollama(Image.new("RGB", (120, 40), color=(255, 255, 255)), "paddleocr-vl-vi")
    sent_payload = json.loads(mock_url.call_args[0][0].data.decode("utf-8"))
    sent_img_bytes = base64.b64decode(sent_payload["messages"][0]["images"][0])
    assert sent_img_bytes.startswith(b"\x89PNG\r\n\x1a\n")


def test_vertical_padding_adaptive_enhancement_and_low_conf_row_retry():
    import math
    import numpy as np
    import cv2
    from app.modules.ocr_engine.service import (
        _detect_text_boxes_bgr,
        _enhance_row_for_ocr,
        _extract_text_lines_paddleocr_vl,
    )

    # 1. Verify asymmetric vertical padding >= 5px protects diacritics
    canvas_img = Image.new("RGB", (600, 300), color=(245, 245, 245))
    buf = io.BytesIO()
    canvas_img.save(buf, format="PNG")
    fake_det = MagicMock()
    # RapidOCR sees padded (+20px) coords, so [120, 120] -> [320, 160] corresponds to [100, 100]..[300, 140] (h=40)
    fake_det.return_value = ([[[120, 120], [320, 120], [320, 160], [120, 160]]], None)
    with patch("app.modules.ocr_engine.service._get_rapidocr_det", return_value=fake_det):
        _, items, _ = _detect_text_boxes_bgr(buf.getvalue(), box_pad_px=3)
    assert len(items) == 1
    x1, y1, x2, y2 = items[0]["bbox"]
    assert x1 == 97 and x2 == 303  # pad_x = 3
    assert y1 <= 94 and y2 >= 146  # pad_y >= 6 for h=40 (int(40*0.14)=6)

    # 2. Verify Laplacian blur detection triggers CLAHE + Unsharp Masking
    sharp_rgb = np.full((60, 240, 3), 245, dtype=np.uint8)
    cv2.putText(sharp_rgb, "VIET NAM", (15, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 2)
    blurry_rgb = cv2.GaussianBlur(sharp_rgb, (9, 9), 2.5)

    _, lap_sharp, enhanced_sharp = _enhance_row_for_ocr(sharp_rgb, orig_row_height=60, force_enhance=False)
    out_blur, lap_blur, enhanced_blur = _enhance_row_for_ocr(blurry_rgb, orig_row_height=24, force_enhance=False)
    assert lap_sharp > lap_blur
    assert enhanced_sharp is False
    assert enhanced_blur is True
    assert out_blur.shape == blurry_rgb.shape

    # 3. Verify adaptive low-confidence row retry when strip logprobs contain an uncertain non-ID line
    fake_bgr = np.full((300, 500, 3), 240, dtype=np.uint8)
    fake_boxes = [
        {"bbox": [50, 20, 400, 45], "crop_rgb": np.full((25, 350, 3), 230, dtype=np.uint8)},
        {"bbox": [50, 60, 320, 88], "crop_rgb": np.full((28, 270, 3), 230, dtype=np.uint8)},
        {"bbox": [50, 110, 420, 140], "crop_rgb": np.full((30, 370, 3), 230, dtype=np.uint8)},
    ]

    strip_resp = MagicMock()
    strip_resp.status = 200
    strip_resp.read.return_value = json.dumps({
        "message": {"content": "Số: 086187000717\nHọ tên: HUỢNH THỔ\nQuê quán: Vĩnh Long"},
        "logprobs": [
            {"token": "Số: 086187000717\n", "logprob": math.log(0.99)},
            {"token": "Họ tên: ", "logprob": math.log(0.95)},
            {"token": "HUỢNH THỔ\n", "logprob": math.log(0.55)},
            {"token": "Quê quán: Vĩnh Long", "logprob": math.log(0.98)},
        ],
    }).encode("utf-8")

    retry_resp = MagicMock()
    retry_resp.status = 200
    retry_resp.read.return_value = json.dumps({
        "message": {"content": "Họ tên: HUỲNH THẢO"},
        "logprobs": [
            {"token": "Họ tên: ", "logprob": math.log(0.98)},
            {"token": "HUỲNH THẢO", "logprob": math.log(0.96)},
        ],
    }).encode("utf-8")

    with patch("app.modules.ocr_engine.service._detect_text_boxes_bgr", return_value=(fake_bgr, fake_boxes, 30.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.side_effect = [strip_resp, retry_resp]
        ocr_lines, _, _ = _extract_text_lines_paddleocr_vl(buf.getvalue())

    assert mock_url.return_value.__enter__.call_count == 2
    assert ocr_lines[1]["text"] == "Họ tên: HUỲNH THẢO"
    assert ocr_lines[1]["confidence"] >= 96.0


def test_vn_address_normalizer_gso_nso_and_postprocess():
    from app.modules.ocr_engine.vn_address_normalizer import normalize_vietnamese_address
    from app.modules.ocr_engine.service import _postprocess_hybrid_extracted_data

    # Legacy 3-tier GSO normalization (accent loss + typo repair, preserving street/hamlet & style)
    assert (
        normalize_vietnamese_address("Ấp 4, Trung Nghia, Vũng Liềm, Vinh Long")
        == "Ấp 4, Trung Nghĩa, Vũng Liêm, Vĩnh Long"
    )
    assert (
        normalize_vietnamese_address("Xã Trung Nghia, H. Vung Liem, Tỉnh Vinh Long")
        == "Xã Trung Nghĩa, Huyện Vũng Liêm, Tỉnh Vĩnh Long"
    )
    assert (
        normalize_vietnamese_address("Thôn Tiền Lệ, Tiên Yên, Hoài Đúc, Ha Noi")
        == "Thôn Tiền Lệ, Tiền Yên, Hoài Đức, Hà Nội"
    )

    # 2025 2-tier NSO normalization (no district level, includes Đặc khu & TP.HCM alias)
    assert (
        normalize_vietnamese_address("Phuong Ba Dinh, Thanh pho Ha Noi")
        == "Phường Ba Đình, Thành phố Hà Nội"
    )
    assert (
        normalize_vietnamese_address("Đặc khu Phu Quoc, Tỉnh An Giang")
        == "Đặc khu Phú Quốc, Tỉnh An Giang"
    )
    assert (
        normalize_vietnamese_address("Số 12 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM")
        == "Số 12 Lê Lợi, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"
    )
    # Legacy historical ward before merger still safely expands 'X.' without forcing a wrong ward name
    assert (
        normalize_vietnamese_address("X. Vạn Thái, H. Ứng Hòa, TP. Hà Nội")
        == "Xã Vạn Thái, Huyện Ứng Hòa, Thành phố Hà Nội"
    )
    # Sub-ward unit diacritic repair (e.g. 'Áp 4'/'Ap 4' -> 'Ấp 4', 'To 5' -> 'Tổ 5', protects 'Tô Hiệu')
    assert (
        normalize_vietnamese_address("Áp 4, Trung Nghĩa, Vũng Liêm, Vĩnh Long")
        == "Ấp 4, Trung Nghĩa, Vũng Liêm, Vĩnh Long"
    )
    assert (
        normalize_vietnamese_address("Ap 4, Trung Nghia, Vũng Liêm, Vinh Long")
        == "Ấp 4, Trung Nghĩa, Vũng Liêm, Vĩnh Long"
    )
    assert (
        normalize_vietnamese_address("To 5, Khu pho 2, Phường Bến Nghé, Quận 1, TP.HCM")
        == "Tổ 5, Khu phố 2, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"
    )
    assert (
        normalize_vietnamese_address("12 Tô Hiệu, Phường Nguyễn Trãi, Quận Hà Đông, Hà Nội")
        == "12 Tô Hiệu, Phường Nguyễn Trãi, Quận Hà Đông, Hà Nội"
    )
    # Historical commune before merger must NOT be over-corrected to a different commune ('Thiệu Phú' != 'Thiệu Phúc')
    assert (
        normalize_vietnamese_address("Thôn Đình Tân, Thiệu Phú, Thiệu Hóa, Thanh Hóa")
        == "Thôn Đình Tân, Thiệu Phú, Thiệu Hóa, Thanh Hóa"
    )

    # Foreign/non-matching address left untouched
    assert normalize_vietnamese_address("Tokyo, Japan") == "Tokyo, Japan"

    # Postprocess integration normalizes both origin_address and residence_address
    cleaned = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "origin_address": "Quê quán: Trung Nghia, Vũng Liềm, Vinh Long",
            "residence_address": "Nơi thường trú: Ấp 4, Trung Nghia, Vũng Liềm, Vinh Long",
        },
        [{"bbox": [0, 0, 100, 20], "text": "Quê quán: Trung Nghia"}],
    )
    assert cleaned["origin_address"] == "Trung Nghĩa, Vũng Liêm, Vĩnh Long"
    assert cleaned["residence_address"] == "Ấp 4, Trung Nghĩa, Vũng Liêm, Vĩnh Long"


def test_paddleocr_vl_strip_chunking_and_repetition_collapse_fallback():
    import numpy as np
    from app.modules.ocr_engine.service import (
        _has_ocr_repetition_collapse,
        _extract_text_lines_paddleocr_vl,
    )

    assert _has_ocr_repetition_collapse([
        "Ngành Thanh Hóa, Thành Hóa, Thành Hóa, Thành Hóa, Thành Hóa, Thành Hóa"
    ]) is True
    assert _has_ocr_repetition_collapse(["Quê quán: Thiệu Phú, Thiệu Hóa, Thanh Hóa"]) is False

    # Build 12 synthetic rows (>9) -> must auto-split into 2 chunks (6 + 6)
    # First chunk succeeds cleanly; second chunk returns a collapsed repeating line -> recovers row-by-row
    buf = io.BytesIO()
    Image.new("RGB", (600, 500), color=(240, 240, 240)).save(buf, format="PNG")
    fake_bgr = np.full((500, 600, 3), 240, dtype=np.uint8)
    fake_boxes = [
        {"bbox": [40, 20 + i * 35, 360, 46 + i * 35], "crop_rgb": np.full((26, 320, 3), 230, dtype=np.uint8)}
        for i in range(12)
    ]

    chunk1_txt = "\n".join([f"LINE {i}" for i in range(1, 7)])
    collapsed_chunk2 = "Ngành Thanh Hóa, Thành Hóa, Thành Hóa, Thành Hóa, Thành Hóa, Thành Hóa"
    fallback_rows = [f"RECOVERED {i}" for i in range(7, 13)]

    with patch("app.modules.ocr_engine.service._detect_text_boxes_bgr", return_value=(fake_bgr, fake_boxes, 25.0)), \
         patch(
             "app.modules.ocr_engine.service._call_paddleocr_vl_ollama",
             side_effect=[chunk1_txt, collapsed_chunk2, *fallback_rows],
         ) as mock_call:
        ocr_lines, _, _ = _extract_text_lines_paddleocr_vl(buf.getvalue())

    assert mock_call.call_count == 8  # 2 strip chunks + 6 recovered per-row calls
    assert [ln["text"] for ln in ocr_lines] == [f"LINE {i}" for i in range(1, 7)] + fallback_rows


def test_passport_mrz_recovery_and_postprocess_fields(client, customer_one_token):
    import numpy as np
    from app.modules.ocr_engine.service import (
        _clean_mrz_line1,
        _clean_mrz_line2,
        _extract_text_lines_paddleocr_vl,
        _postprocess_hybrid_extracted_data,
    )

    # 1. ICAO MRZ line 1 & line 2 normalization (strips PaddleOCR-VL CJK '<' hallucinations & pads to 44)
    assert (
        _clean_mrz_line1("P<VNMVU<<THU<HA涓涓涓涓涓涓涓涓涓涓涓")
        == "P<VNMVU<<THU<HA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    )
    assert (
        _clean_mrz_line2("C4665287<8VNM8810182F2803124012612613<<<<04")
        == "C4665287<8VNM8810182F2803124012612613<<<<<04"
    )
    assert (
        _clean_mrz_line2("C01429561VNM8602020M250313621244039962")
        == "C0142956<1VNM8602020M2503136212440399<<<<<62"
    )

    # 2. Post-processing splits 'P VNM C4665287', recovers place_of_birth, id_card_number, and 2 MRZ lines
    passport_lines = [
        {"bbox": [0, 0, 100, 18], "text": "Hộ CHIẾU / PASSPORT  Loại / Type  Mã số / Code  Số hộ chiếu / Passport N°", "confidence": 91.0, "token_count": 10},
        {"bbox": [0, 20, 100, 38], "text": "P VNM C4665287", "confidence": 94.0, "token_count": 4},
        {"bbox": [0, 40, 100, 58], "text": "VŨ THU HÀ", "confidence": 98.5, "token_count": 3},
        {"bbox": [0, 60, 100, 78], "text": "Ngày sinh / Date of birth  Nơi sinh / Place of Birth", "confidence": 94.0, "token_count": 8},
        {"bbox": [0, 80, 100, 98], "text": "18/10/1988  HÀ NỘI", "confidence": 95.2, "token_count": 4},
        {"bbox": [0, 100, 100, 118], "text": "Giới tính / Sex  Số GCMND / ID card", "confidence": 83.0, "token_count": 6},
        {"bbox": [0, 120, 100, 138], "text": "NỮ/F 012612613", "confidence": 94.4, "token_count": 4},
        {"bbox": [0, 140, 100, 158], "text": "Cục Quản lý xuất nhập cảnh", "confidence": 99.8, "token_count": 6},
        {"bbox": [0, 160, 100, 178], "text": "P<VNMVU<<THU<HA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<", "confidence": 85.0, "token_count": 10},
        {"bbox": [0, 180, 100, 198], "text": "C4665287<8VNM8810182F2803124012612613<<<<<04", "confidence": 96.4, "token_count": 14},
    ]
    cleaned = _postprocess_hybrid_extracted_data(
        {
            "document_type": "passport",
            "passport_number": "P VNM C4665287",
            "full_name": "VŨ THU HÀ",
            "date_of_birth": "18/10/1988",
            "gender": "Nữ",
            "nationality": "VIỆT NAM",
            "issue_date": "12/03/2018",
            "expiry_date": "12/03/2028",
            "issue_place": "Cục Quản lý xuất nhập cảnh",
        },
        passport_lines,
    )
    assert cleaned["passport_type"] == "P"
    assert cleaned["country_code"] == "VNM"
    assert cleaned["passport_number"] == "C4665287"
    assert cleaned["place_of_birth"] == "Hà Nội"
    assert cleaned["id_card_number"] == "012612613"
    assert cleaned["mrz_line1"] == "P<VNMVU<<THU<HA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    assert cleaned["mrz_line2"] == "C4665287<8VNM8810182F2803124012612613<<<<<04"

    # 3. Recover missing MRZ line 2 via RapidOCR rec when PaddleOCR-VL strip drops it
    buf = io.BytesIO()
    Image.new("RGB", (750, 500), color=(240, 240, 240)).save(buf, format="PNG")
    fake_bgr = np.full((500, 750, 3), 240, dtype=np.uint8)
    fake_boxes = [
        {"bbox": [50, 20 + i * 25, 680, 40 + i * 25], "crop_rgb": np.full((20, 630, 3), 230, dtype=np.uint8)}
        for i in range(10)
    ]
    # Override bottom 2 rows into realistic bottom-wide MRZ geometry
    fake_boxes[8]["bbox"] = [40, 395, 715, 430]
    fake_boxes[9]["bbox"] = [40, 435, 715, 470]

    chunk1 = "CỘNG HÒA\nHỘ CHIẾU / PASSPORT\nP VNM C4665287\nVŨ THU HÀ\n18/10/1988 HÀ NỘI"
    chunk2 = "NỮ/F 012612613\n12/03/2018 12/03/2028\nCục Quản lý xuất nhập cảnh\nP<VNMVU<<THU<HA涓涓涓涓涓"
    fake_rec = MagicMock(return_value=([["C4665287<8VNM8810182F2803124012612613<<<<04", 0.965]], None))

    with patch("app.modules.ocr_engine.service._detect_text_boxes_bgr", return_value=(fake_bgr, fake_boxes, 20.0)), \
         patch("app.modules.ocr_engine.service._call_paddleocr_vl_ollama", side_effect=[chunk1, chunk2]), \
         patch("app.modules.ocr_engine.service._get_rapidocr_rec", return_value=fake_rec):
        ocr_lines, _, _ = _extract_text_lines_paddleocr_vl(buf.getvalue())

    assert ocr_lines[-2]["text"] == "P<VNMVU<<THU<HA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    assert ocr_lines[-1]["text"] == "C4665287<8VNM8810182F2803124012612613<<<<<04"

    # 4. End-to-end API test returns corrected passport_number, place_of_birth, and MRZ lines + field confidences
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    sample_img = make_sample_id_with_background_bytes()
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(passport_lines, 120.0, 2100.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response({
            "document_type": "passport",
            "passport_number": "P VNM C4665287",
            "full_name": "VŨ THU HÀ",
            "date_of_birth": "18/10/1988",
            "gender": "Nữ",
            "nationality": "VIỆT NAM",
            "issue_date": "12/03/2018",
            "expiry_date": "12/03/2028",
            "issue_place": "Cục Quản lý xuất nhập cảnh",
        })
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("005.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id},
        )

    assert res.status_code == 200
    body = res.json()
    ex = body["extracted_data"]
    assert ex["passport_number"] == "C4665287"
    assert ex["passport_type"] == "P"
    assert ex["country_code"] == "VNM"
    assert ex["place_of_birth"] == "Hà Nội"
    assert ex["id_card_number"] == "012612613"
    assert ex["mrz_line1"] == "P<VNMVU<<THU<HA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    assert ex["mrz_line2"] == "C4665287<8VNM8810182F2803124012612613<<<<<04"
    assert "place_of_birth" in body["field_confidences"]
    assert "mrz_line1" in body["field_confidences"]
    assert "mrz_line2" in body["field_confidences"]


def test_passport_stacked_row_grouping_name_guardrail_and_passport_type_confidence(client, customer_one_token):
    import math
    from app.modules.ocr_engine.service import (
        _postprocess_hybrid_extracted_data,
        _sort_ocr_lines_y_center,
    )

    # 1. Stacked boxes on compact passport (580x357) must NOT merge TRẦN ANH TUẤN with Quốc tịch / Nationality
    compact_boxes = [
        {"bbox": [199, 72, 329, 97], "text": "Họ và tên / Full name"},
        {"bbox": [202, 87, 339, 115], "text": "TRẦN ANH TUẤN"},
        {"bbox": [201, 104, 335, 130], "text": "Quốc tịch / Nationality"},
        {"bbox": [373, 101, 542, 127], "text": "VIỆT NAM / VIETNAMESE"},
        {"bbox": [202, 139, 301, 164], "text": "24 / 10 / 1980"},
        {"bbox": [371, 137, 514, 163], "text": "TUYÊN QUANG"},
        {"bbox": [200, 154, 288, 179], "text": "Giới tính / Sex"},
        {"bbox": [370, 151, 520, 177], "text": "Số GCMND / ID card N°"},
    ]
    grouped = _sort_ocr_lines_y_center(compact_boxes, img_width=580, img_height=357)
    row_texts = [[it["text"] for it in r] for r in grouped]
    assert row_texts == [
        ["Họ và tên / Full name"],
        ["TRẦN ANH TUẤN"],
        ["Quốc tịch / Nationality", "VIỆT NAM / VIETNAMESE"],
        ["24 / 10 / 1980", "TUYÊN QUANG"],
        ["Giới tính / Sex", "Số GCMND / ID card N°"],
    ]

    # 2. MRZ Line 1 guardrail rejects hallucinated prefix words ('QUAN QUANG TRAN ANH TUAN')
    pp_lines = [
        {"bbox": [0, 0, 100, 18], "text": "P  VNM  C1869977", "confidence": 95.0, "token_count": 4,
         "tokens": [("P", 60.0), ("  ", 95.0), ("VNM", 99.0), ("  C1869977", 99.5)]},
        {"bbox": [0, 20, 100, 38], "text": "TRẦN ANH TUẤN", "confidence": 96.0, "token_count": 3,
         "tokens": [("TRẦN", 94.0), (" ANH", 98.0), (" TUẤN", 97.0)]},
        {"bbox": [0, 40, 100, 58], "text": "24/10/1980  TUYÊN QUANG", "confidence": 95.0, "token_count": 4},
        {"bbox": [0, 50, 100, 59], "text": "Ngày cấp / Date of issue  Có giá trị đến / Date of expiry", "confidence": 95.0, "token_count": 8},
        {"bbox": [0, 60, 100, 69], "text": "15/06/2016 15/06/2026", "confidence": 98.0, "token_count": 6},
        {"bbox": [0, 60, 100, 78], "text": "P<VNMTRAN<<ANH<TUAN<<<<<<<<<<<<<<<<<<<<<<<<<", "confidence": 85.0, "token_count": 10,
         "tokens": [("P<VNM", 94.0), ("TRAN<<ANH<TUAN<<<", 82.0)]},
        {"bbox": [0, 80, 100, 98], "text": "C1869977<3VNM8010247M2606152073336499<<<<<48", "confidence": 99.0, "token_count": 14},
    ]
    cleaned = _postprocess_hybrid_extracted_data(
        {"document_type": "passport", "full_name": "QUAN QUANG TRAN ANH TUAN", "passport_number": "C1869977"},
        pp_lines,
    )
    assert cleaned["full_name"] == "TRẦN ANH TUẤN"
    assert cleaned["passport_type"] == "P"
    assert cleaned["date_of_birth"] == "24/10/1980"
    assert cleaned["issue_date"] == "15/06/2016"
    assert cleaned["expiry_date"] == "15/06/2026"

    # 3. API confidence corroborates passport_type via 'P VNM'/'P<VNM' and ignores stale hallucinated LLM full_name logprob
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    llm_tokens = [
        ('{"document_type": "', math.log(1.0)),
        ("passport", math.log(0.99)),
        ('", "passport_type": "', math.log(1.0)),
        ("P", math.log(0.98)),
        ('", "country_code": "', math.log(1.0)),
        ("VNM", math.log(0.99)),
        ('", "passport_number": "', math.log(1.0)),
        ("C1869977", math.log(0.99)),
        ('", "full_name": "', math.log(1.0)),
        ("QUAN QUANG TRAN ANH TUAN", math.log(0.50)),
        ('"}', math.log(1.0)),
    ]
    llm_resp = MagicMock()
    llm_resp.status = 200
    llm_resp.read.return_value = json.dumps({
        "message": {"role": "assistant", "content": "".join(t for t, _ in llm_tokens)},
        "logprobs": [{"token": t, "logprob": lp} for t, lp in llm_tokens],
    }).encode("utf-8")

    sample_img = make_sample_id_with_background_bytes()
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(pp_lines, 80.0, 900.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = llm_resp
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("003.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["extracted_data"]["full_name"] == "TRẦN ANH TUẤN"
    assert body["field_confidences"]["passport_type"] >= 90.0
    assert body["field_confidences"]["full_name"] >= 95.0


def test_td1_mrz_cleaners_and_plan_b_per_side_schemas():
    import numpy as np
    from app.modules.ocr_engine.service import (
        _clean_td1_mrz_line1,
        _clean_td1_mrz_line2,
        _clean_td1_mrz_line3,
        _parse_td1_mrz_fields,
        _postprocess_hybrid_extracted_data,
        _extract_text_lines_paddleocr_vl,
    )

    # 1. Clean & validate TD1 MRZ from real CCCD gắn chip back & Căn cước 2024 back templates
    assert _clean_td1_mrz_line1("IDVNM16200015320841620001530") == "IDVNM1620001532084162000153<<0"
    assert _clean_td1_mrz_line2("6201016F9912315VNM8") == "6201016F9912315VNM<<<<<<<<<<<8"
    assert _clean_td1_mrz_line3("THACH<<THI<AM涓涓涓涓") == "THACH<<THI<AM<<<<<<<<<<<<<<<<<"

    parsed_chip = _parse_td1_mrz_fields(
        "IDVNM1620001532084162000153<<0",
        "6201016F9912315VNM<<<<<<<<<<<8",
        "THACH<<THI<AM<<<<<<<<<<<<<<<<<",
    )
    assert parsed_chip == {
        "id_number": "084162000153",
        "date_of_birth": "01/01/1962",
        "gender": "Nữ",
        "expiry_date": "Không thời hạn",
        "nationality": "Việt Nam",
    }

    parsed_cc24 = _parse_td1_mrz_fields(
        "IDVNM1990033878019199003387<<0",
        "9906220F3906228VNM<<<<<<<<<<<0",
        "TRAN<<THI<THU<<<<<<<<<<<<<<<<<",
    )
    assert parsed_cc24 == {
        "id_number": "019199003387",
        "date_of_birth": "22/06/1999",
        "gender": "Nữ",
        "expiry_date": "22/06/2039",
        "nationality": "Việt Nam",
    }

    # 2. Plan B keys for Căn cước 2024 Front (strictly 8 keys, no addresses/expiry/issue_place)
    cc24_front = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "id_number": "019199003387",
            "full_name": "TRẦN THỊ THU",
            "date_of_birth": "22/06/1999",
            "gender": "Nữ",
            "nationality": "Việt Nam",
            "origin_address": "hallucinated",
            "issue_place": "hallucinated",
        },
        [
            {"bbox": [0, 0, 100, 20], "text": "CĂN CƯỚC"},
            {"bbox": [0, 25, 100, 45], "text": "Số định danh cá nhân / Personal identification number: 019199003387"},
            {"bbox": [0, 50, 100, 70], "text": "Họ, chữ đệm và tên khai sinh / Full name: TRẦN THỊ THU"},
        ],
    )
    assert cc24_front["card_subtype"] == "Căn cước 2024"
    assert cc24_front["card_side"] == "front"
    assert set(cc24_front.keys()) == {
        "document_type",
        "card_subtype",
        "card_side",
        "id_number",
        "full_name",
        "date_of_birth",
        "gender",
        "nationality",
    }

    # 3. Plan B keys for CCCD gắn chip Back (with signer_name + auto-decoded TD1 MRZ fields)
    chip_back = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "personal_identification": "Đặc điểm nhân dạng: Sẹo chấm C:3.6 cm dưới sau đuôi mắt phải",
            "issue_date": "15/04/2021",
            "issue_place": "CỤC TRƯỞNG CỤC CẢNH SÁT QUẢN LÝ HÀNH CHÍNH VỀ TRẬT TỰ XÃ HỘI",
            "signer_name": "Phạm Công Nguyên",
            "origin_address": "should be omitted",
        },
        [
            {"bbox": [0, 0, 100, 20], "text": "Đặc điểm nhân dạng / Personal identification: Sẹo chấm C:3.6 cm dưới sau đuôi mắt phải"},
            {"bbox": [0, 25, 100, 45], "text": "Ngày, tháng, năm / Date, month, year: 15/04/2021"},
            {"bbox": [0, 50, 100, 70], "text": "CỤC TRƯỞNG CỤC CẢNH SÁT QUẢN LÝ HÀNH CHÍNH VỀ TRẬT TỰ XÃ HỘI"},
            {"bbox": [0, 75, 100, 95], "text": "Phạm Công Nguyên"},
            {"bbox": [0, 100, 100, 120], "text": "IDVNM1620001532084162000153<<0"},
            {"bbox": [0, 125, 100, 145], "text": "6201016F9912315VNM<<<<<<<<<<<8"},
            {"bbox": [0, 150, 100, 170], "text": "THACH<<THI<AM<<<<<<<<<<<<<<<<<"},
        ],
    )
    assert chip_back["card_subtype"] == "CCCD gắn chip"
    assert chip_back["card_side"] == "back"
    assert chip_back["personal_identification"] == "Sẹo chấm C:3.6 cm dưới sau đuôi mắt phải"
    assert chip_back["signer_name"] == "Phạm Công Nguyên"
    assert chip_back["id_number"] == "084162000153"
    assert chip_back["date_of_birth"] == "01/01/1962"
    assert chip_back["gender"] == "Nữ"
    assert chip_back["expiry_date"] == "Không thời hạn"
    assert chip_back["nationality"] == "Việt Nam"
    assert "origin_address" not in chip_back

    # 4. Plan B keys for Căn cước 2024 Back (place_of_birth + residence_address + Bộ Công An + MRZ)
    cc24_back = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "residence_address": "Nơi cư trú: Tổ 5, Phú Lương, Hà Đông, Hà Nội",
            "place_of_birth": "Nơi đăng ký khai sinh: Thái Nguyên",
            "issue_date": "05/07/2024",
            "expiry_date": "22/06/2039",
            "origin_address": "should be omitted",
        },
        [
            {"bbox": [0, 0, 100, 20], "text": "BỘ CÔNG AN / MINISTRY OF PUBLIC SECURITY"},
            {"bbox": [0, 25, 100, 45], "text": "Nơi cư trú / Place of residence: Tổ 5, Phú Lương, Hà Đông, Hà Nội"},
            {"bbox": [0, 50, 100, 70], "text": "Nơi đăng ký khai sinh / Place of birth: Thái Nguyên"},
            {"bbox": [0, 75, 100, 95], "text": "Ngày, tháng, năm cấp / Date of issue: 05/07/2024"},
            {"bbox": [0, 100, 100, 120], "text": "IDVNM1990033878019199003387<<0"},
            {"bbox": [0, 125, 100, 145], "text": "9906220F3906228VNM<<<<<<<<<<<0"},
            {"bbox": [0, 150, 100, 170], "text": "TRAN<<THI<THU<<<<<<<<<<<<<<<<<"},
        ],
    )
    assert cc24_back["card_subtype"] == "Căn cước 2024"
    assert cc24_back["card_side"] == "back"
    assert cc24_back["issue_place"] == "BỘ CÔNG AN"
    assert cc24_back["place_of_birth"] == "Thái Nguyên"
    assert "origin_address" not in cc24_back
    assert "personal_identification" not in cc24_back

    # 5. Plan B keys for old CMND Back (ethnic, religion, personal_identification)
    cmnd_back = _postprocess_hybrid_extracted_data(
        {
            "document_type": "id_card",
            "ethnic": "Dân tộc: Kinh",
            "religion": "Tôn giáo: Không",
            "personal_identification": "Dấu vết riêng và dị hình: Nốt ruồi C:2cm dưới sau đuôi mắt trái",
            "issue_date": "12/05/2012",
            "issue_place": "GIÁM ĐỐC CA TỈNH AN GIANG",
        },
        [
            {"bbox": [0, 0, 100, 20], "text": "Dân tộc: Kinh   Tôn giáo: Không"},
            {"bbox": [0, 25, 100, 45], "text": "Dấu vết riêng và dị hình: Nốt ruồi C:2cm dưới sau đuôi mắt trái"},
            {"bbox": [0, 50, 100, 70], "text": "Ngày 12 tháng 05 năm 2012   GIÁM ĐỐC CA TỈNH AN GIANG"},
        ],
    )
    assert cmnd_back["card_subtype"] == "CMND"
    assert cmnd_back["card_side"] == "back"
    assert cmnd_back["ethnic"] == "Kinh"
    assert cmnd_back["religion"] == "Không"
    assert "mrz_line1" not in cmnd_back

    # 6. TD1 3-row bottom MRZ recovery in _extract_text_lines_paddleocr_vl
    buf = io.BytesIO()
    Image.new("RGB", (750, 500), color=(240, 240, 240)).save(buf, format="PNG")
    fake_bgr = np.full((500, 750, 3), 240, dtype=np.uint8)
    fake_boxes = [
        {"bbox": [40, 30 + i * 35, 680, 55 + i * 35], "crop_rgb": np.full((25, 640, 3), 230, dtype=np.uint8)}
        for i in range(6)
    ]
    fake_boxes[3]["bbox"] = [40, 355, 710, 385]
    fake_boxes[4]["bbox"] = [40, 395, 710, 425]
    fake_boxes[5]["bbox"] = [40, 435, 710, 465]
    strip_txt = "BỘ CÔNG AN\nNơi cư trú: Hà Nội\nNơi đăng ký khai sinh: Thái Nguyên\nIDVNM19900338780191990033870"
    fake_rec = MagicMock(
        side_effect=[
            ([["9906220F3906228VNM<<<<<<<<<<<0", 0.985]], None),
            ([["TRAN<<THI<THU<<<<<<<<<<<<<<<<<", 0.980]], None),
        ]
    )
    with patch("app.modules.ocr_engine.service._detect_text_boxes_bgr", return_value=(fake_bgr, fake_boxes, 15.0)), \
         patch("app.modules.ocr_engine.service._call_paddleocr_vl_ollama", return_value=strip_txt), \
         patch("app.modules.ocr_engine.service._get_rapidocr_rec", return_value=fake_rec):
        td1_lines, _, _ = _extract_text_lines_paddleocr_vl(buf.getvalue())

    assert td1_lines[-3]["text"] == "IDVNM1990033878019199003387<<0"
    assert td1_lines[-2]["text"] == "9906220F3906228VNM<<<<<<<<<<<0"
    assert td1_lines[-1]["text"] == "TRAN<<THI<THU<<<<<<<<<<<<<<<<<"


def test_td1_mrz_auto_decode_when_field_score_is_low(client, customer_one_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]
    order_id = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id},
    ).json()["id"]
    license_id = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"},
    ).json()["license_id"]

    # Visual expiry_date is misread with low score (68.0 < 85.0), while TD1 MRZ lines have high confidence (98.0)
    back_lines = [
        {"bbox": [0, 0, 100, 18], "text": "BỘ CÔNG AN / MINISTRY OF PUBLIC SECURITY", "confidence": 96.0, "token_count": 6},
        {"bbox": [0, 20, 100, 38], "text": "Nơi cư trú: Hà Đông, Hà Nội", "confidence": 95.0, "token_count": 6},
        {"bbox": [0, 40, 100, 58], "text": "Nơi đăng ký khai sinh: Thái Nguyên", "confidence": 95.0, "token_count": 6},
        {"bbox": [0, 60, 100, 78], "text": "05/07/2024", "confidence": 94.0, "token_count": 3},
        {"bbox": [0, 80, 100, 98], "text": "22/06/2038", "confidence": 68.0, "token_count": 3},
        {"bbox": [0, 100, 100, 118], "text": "IDVNM1990033878019199003387<<0", "confidence": 98.5, "token_count": 10},
        {"bbox": [0, 120, 100, 138], "text": "9906220F3906228VNM<<<<<<<<<<<0", "confidence": 98.2, "token_count": 10},
        {"bbox": [0, 140, 100, 158], "text": "TRAN<<THI<THU<<<<<<<<<<<<<<<<<", "confidence": 97.5, "token_count": 8},
    ]

    sample_img = make_sample_id_with_background_bytes()
    with patch("app.modules.ocr_engine.service._extract_text_lines_paddleocr_vl", return_value=(back_lines, 90.0, 1200.0)), \
         patch("urllib.request.urlopen") as mock_url:
        mock_url.return_value.__enter__.return_value = mock_ollama_response({
            "document_type": "id_card",
            "card_subtype": "Căn cước 2024",
            "card_side": "back",
            "residence_address": "Hà Đông, Hà Nội",
            "place_of_birth": "Thái Nguyên",
            "issue_date": "05/07/2024",
            "expiry_date": "22/06/2038",
            "issue_place": "BỘ CÔNG AN",
            "mrz_line1": "IDVNM1990033878019199003387<<0",
            "mrz_line2": "9906220F3906228VNM<<<<<<<<<<<0",
            "mrz_line3": "TRAN<<THI<THU<<<<<<<<<<<<<<<<<",
        })
        res = client.post(
            "/api/v1/ocr/process-identity",
            headers={"Authorization": f"Bearer {customer_one_token}"},
            files={"file": ("cancuoc_back.jpg", io.BytesIO(sample_img), "image/jpeg")},
            data={"license_id": license_id},
        )

    assert res.status_code == 200
    body = res.json()
    ex = body["extracted_data"]
    fc = body["field_confidences"]
    # expiry_date had low visual score (68.0 < 85.0) -> auto-corrected from MRZ to 22/06/2039 with MRZ confidence
    assert ex["expiry_date"] == "22/06/2039"
    assert fc["expiry_date"] == 98.2
    # Missing MRZ fields on back side auto-populated from TD1 MRZ
    assert ex["id_number"] == "019199003387"
    assert ex["date_of_birth"] == "22/06/1999"
    assert ex["gender"] == "Nữ"
    assert ex["nationality"] == "Việt Nam"
    assert fc["id_number"] == 98.5
    assert "origin_address" not in ex
