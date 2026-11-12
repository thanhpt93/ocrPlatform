import sys
sys.path.insert(0, 'C:/project/ocrPlatform/backend')
import io
from PIL import Image, ImageDraw
from app.modules.ocr_engine.service import segment_identity_document

# Create a 1200x900 dark wooden desk background with a light ID card in the center (300, 200, 900, 600)
bg = Image.new("RGB", (1200, 900), (45, 35, 30))
draw = ImageDraw.Draw(bg)
draw.rectangle([300, 200, 900, 600], fill=(235, 240, 245), outline=(180, 190, 200), width=4)

buf = io.BytesIO()
bg.save(buf, format="JPEG", quality=92)
img_bytes = buf.getvalue()

# Test 1: Pure CV segmentation (no VLM bbox)
orig_url, crop_url, meta = segment_identity_document(img_bytes, None)
print("CV Segmentation Meta:", meta.model_dump())
assert meta.detected is True
assert 550 <= (meta.bbox[2] - meta.bbox[0]) <= 660
assert 350 <= (meta.bbox[3] - meta.bbox[1]) <= 460

# Test 2: VLM Grounding BBox segmentation ([ymin, xmin, ymax, xmax] normalized 0..1000)
# ymin=200/900=222, xmin=300/1200=250, ymax=600/900=667, xmax=900/1200=750
orig_url2, crop_url2, meta2 = segment_identity_document(img_bytes, [222, 250, 667, 750])
print("VLM Segmentation Meta:", meta2.model_dump())
assert meta2.detected is True
assert meta2.method == "vlm_grounding_bbox"
print("All segmentation tests passed!")
