import sys
sys.path.insert(0, 'C:/project/ocrPlatform/backend')
import io
from PIL import Image
from app.modules.ocr_engine.service import normalize_image_bytes

# Create a sample WebP image disguised as .jpg
img = Image.new("RGBA", (2400, 1800), (200, 100, 50, 255))
buf = io.BytesIO()
img.save(buf, format="WEBP")
webp_bytes = buf.getvalue()

normalized = normalize_image_bytes(webp_bytes)
with Image.open(io.BytesIO(normalized)) as out_img:
    print("Normalized format:", out_img.format, "mode:", out_img.mode, "size:", out_img.size)
    assert out_img.format == "JPEG"
    assert out_img.mode == "RGB"
    assert max(out_img.size) <= 1600
print("Normalization verified successfully!")
