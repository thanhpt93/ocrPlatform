import io
import sys
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"C:\project\ocrPlatform\backend")
from app.modules.ocr_engine.service import segment_identity_document

# 1. Vertical card with red emblem + header on the RIGHT side -> should rotate 270° CW (90° CCW) to landscape
img = Image.new("RGB", (1200, 1600), color=(90, 75, 65))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle([138, 31, 1143, 1573], radius=24, fill=(205, 225, 225), outline=(150, 175, 175), width=3)
draw.ellipse([930, 180, 1060, 310], fill=(215, 35, 30))
draw.rectangle([820, 420, 875, 1150], fill=(205, 40, 35))

buf = io.BytesIO()
img.save(buf, format="JPEG", quality=92)
orig_url, crop_url, meta = segment_identity_document(buf.getvalue(), [138, 31, 1143, 1573], vlm_orientation=None)
print("Result for vertical card (header on right):", meta.model_dump())
assert meta.rotation_applied_deg == 270
cw, ch = map(int, meta.cropped_dimensions.split("x"))
assert cw > ch, f"Expected landscape (cw > ch), got {cw}x{ch}"

# 2. Vertical card with red emblem + header on the LEFT side -> should rotate 90° CW to landscape
img2 = Image.new("RGB", (1200, 1600), color=(90, 75, 65))
draw2 = ImageDraw.Draw(img2)
draw2.rounded_rectangle([138, 31, 1143, 1573], radius=24, fill=(205, 225, 225), outline=(150, 175, 175), width=3)
draw2.ellipse([200, 1200, 330, 1330], fill=(215, 35, 30))
draw2.rectangle([340, 450, 395, 1180], fill=(205, 40, 35))

buf2 = io.BytesIO()
img2.save(buf2, format="JPEG", quality=92)
orig_url2, crop_url2, meta2 = segment_identity_document(buf2.getvalue(), [138, 31, 1143, 1573], vlm_orientation=None)
print("Result for vertical card (header on left):", meta2.model_dump())
assert meta2.rotation_applied_deg == 90
cw2, ch2 = map(int, meta2.cropped_dimensions.split("x"))
assert cw2 > ch2, f"Expected landscape (cw2 > ch2), got {cw2}x{ch2}"
print("ALL UPRIGHT ROTATION TESTS PASSED!")
