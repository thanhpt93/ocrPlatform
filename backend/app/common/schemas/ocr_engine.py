from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class IDCardData(BaseModel):
    document_type: str = "id_card"
    card_subtype: Optional[str] = Field(None, description="CCCD gắn chip, Căn cước 2024, hoặc CMND")
    id_number: Optional[str] = Field(None, description="Số định danh cá nhân / Số CCCD / CMND")
    full_name: Optional[str] = Field(None, description="Họ và tên")
    date_of_birth: Optional[str] = Field(None, description="Ngày sinh (DD/MM/YYYY)")
    gender: Optional[str] = Field(None, description="Giới tính (Nam/Nữ)")
    nationality: Optional[str] = Field(None, description="Quốc tịch")
    origin_address: Optional[str] = Field(None, description="Quê quán")
    residence_address: Optional[str] = Field(None, description="Nơi thường trú / Nơi cư trú")
    issue_date: Optional[str] = Field(None, description="Ngày cấp")
    expiry_date: Optional[str] = Field(None, description="Có giá trị đến / Ngày hết hạn")
    issue_place: Optional[str] = Field(None, description="Nơi cấp")

class PassportData(BaseModel):
    document_type: str = "passport"
    passport_number: Optional[str] = Field(None, description="Số hộ chiếu (Passport No.)")
    passport_type: Optional[str] = Field("P", description="Loại hộ chiếu (Type)")
    country_code: Optional[str] = Field(None, description="Mã quốc gia (Code: VNM...)")
    full_name: Optional[str] = Field(None, description="Họ và tên đầy đủ")
    id_card_number: Optional[str] = Field(None, description="Số Giấy CMND / CCCD (Personal ID No.)")
    nationality: Optional[str] = Field(None, description="Quốc tịch")
    date_of_birth: Optional[str] = Field(None, description="Ngày sinh (DD/MM/YYYY)")
    gender: Optional[str] = Field(None, description="Giới tính (M/F)")
    place_of_birth: Optional[str] = Field(None, description="Nơi sinh")
    issue_date: Optional[str] = Field(None, description="Ngày cấp")
    expiry_date: Optional[str] = Field(None, description="Ngày hết hạn")
    issue_authority: Optional[str] = Field(None, description="Cơ quan cấp")
    mrz_line1: Optional[str] = Field(None, description="Dòng MRZ 1")
    mrz_line2: Optional[str] = Field(None, description="Dòng MRZ 2")

class DriverLicenseData(BaseModel):
    document_type: str = "driver_license"
    license_number: Optional[str] = Field(None, description="Số GPLX (No.)")
    full_name: Optional[str] = Field(None, description="Họ và tên")
    date_of_birth: Optional[str] = Field(None, description="Ngày sinh (DD/MM/YYYY)")
    nationality: Optional[str] = Field(None, description="Quốc tịch")
    residence_address: Optional[str] = Field(None, description="Nơi cư trú")
    license_class: Optional[str] = Field(None, description="Hạng GPLX (A1, A2, B1, B2, C, D...)")
    issue_date: Optional[str] = Field(None, description="Ngày cấp")
    expiry_date: Optional[str] = Field(None, description="Ngày hết hạn (hoặc Vô thời hạn)")
    issue_place: Optional[str] = Field(None, description="Nơi cấp (Sở GTVT...)")

class SegmentationMetadata(BaseModel):
    detected: bool = True
    method: str = "cv_background_contrast"
    bbox: List[int] = Field(default_factory=list, description="[xmin, ymin, xmax, ymax] in pixels")
    original_dimensions: str = Field("", description="WxH of original image")
    cropped_dimensions: str = Field("", description="WxH of segmented ID card")
    crop_area_ratio: float = Field(1.0, description="Ratio of cropped card area to original image area")
    rotation_applied_deg: int = Field(0, description="Clockwise degrees rotated to make the ID card upright (0, 90, 180, 270)")
    pipeline_mode: str = Field("hybrid", description="OCR pipeline mode used (hybrid, hybrid_paddle_vl, or vlm)")
    ocr_lines_count: int = Field(0, description="Number of text lines recognized by VietOCR or PaddleOCR-VL in hybrid mode")
    stage_timings_ms: Dict[str, float] = Field(default_factory=dict, description="Per-stage latency breakdown in ms")

class OCRExtractionResponse(BaseModel):
    job_id: str
    status: str = "completed"
    file_name: str
    detected_type: str
    service_id: str
    service_name: str
    license_id: str
    confidence_score: float
    execution_time_ms: int
    extracted_data: Dict[str, Any]
    original_image_url: Optional[str] = Field(None, description="Data URL of original uploaded image")
    cropped_image_url: Optional[str] = Field(None, description="Data URL of segmented/cropped ID card image")
    segmentation_info: Optional[SegmentationMetadata] = None
    quota_used: int = 1
    remaining_quota: int
    created_at: str

class VLMModelOption(BaseModel):
    name: str
    label: str
    vram_estimate: str
    tier: str
    mode: str = "hybrid"
    installed: bool = False

class VLMHealthResponse(BaseModel):
    ollama_status: str
    active_model: str
    pipeline_mode: str = "hybrid"
    hybrid_llm_model: str = "qwen2.5:3b"
    paddleocr_vl_model: str = "paddleocr-vl-vi"
    paddleocr_vl_ready: bool = False
    vietocr_ready: bool = True
    rapidocr_ready: bool = True
    gpu_accelerated: bool
    ollama_base_url: str = "http://localhost:11434"
    installed_models: List[str] = Field(default_factory=list)
    available_models: List[VLMModelOption] = Field(default_factory=list)
