import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


class Settings(BaseSettings):
    PROJECT_NAME: str = "ocrPlatform API"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    # Security
    SECRET_KEY: str = "OCR_SUPER_SECRET_KEY_PHASE_2_DEVELOPMENT_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    # Support SQLite fallback if Postgres is not running locally
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./ocrplatform.db"
    )

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # OCR Pipeline & Ollama Inference Configuration
    OCR_PIPELINE_MODE: str = "hybrid"  # "hybrid" (VietOCR + Text LLM), "hybrid_paddle_vl" (PaddleOCR-VL-Vi + Text LLM), or "vlm"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_TEXT_MODEL: str = "qwen2.5:3b"
    PADDLEOCR_VL_MODEL: str = "paddleocr-vl-vi"
    PADDLEOCR_VL_STRIP_MIN_ROW_HEIGHT: int = 48
    OLLAMA_MODEL: str = "qwen2.5vl:3b"
    OLLAMA_NUM_CTX: int = 4096
    OLLAMA_NUM_PREDICT: int = 1024
    OLLAMA_TIMEOUT_SECONDS: int = 240
    VLM_MAX_IMAGE_DIMENSION: int = 1280
    VLM_CROPPED_MAX_WIDTH: int = 1280
    VLM_CROPPED_MAX_HEIGHT: int = 1280
    DOCALIGNER_ENABLED: bool = True
    DOCALIGNER_MODEL_CFG: str = "fastvit_sa24"
    RAPIDOCR_DET_THRESH: float = 0.25
    RAPIDOCR_DET_BOX_THRESH: float = 0.40
    RAPIDOCR_DET_UNCLIP_RATIO: float = 1.55
    VIETOCR_MODEL_NAME: str = "vgg_transformer"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4173",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(_PROJECT_ROOT, ".env"),
            os.path.join(_PROJECT_ROOT, "backend", ".env"),
            ".env",
        ),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )


settings = Settings()
