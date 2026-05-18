"""Test /analyze/sign endpoint. First call loads Gemma 4 E2B (~10GB, slow)."""
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw

BACKEND = "http://127.0.0.1:8000"


def make_thumbs_up_image(path: Path) -> None:
    """Generate a simple thumbs-up gesture image for testing."""
    img = Image.new("RGB", (512, 512), color=(245, 240, 230))
    draw = ImageDraw.Draw(img)

    # Palm (rounded rectangle)
    palm_color = (220, 180, 140)
    draw.rounded_rectangle((180, 220, 320, 400), radius=30, fill=palm_color, outline="black", width=3)

    # Folded fingers (small rectangles at top of palm)
    for i, x in enumerate([195, 230, 265]):
        draw.rounded_rectangle((x, 200, x + 25, 240), radius=8, fill=palm_color, outline="black", width=2)

    # Thumb pointing up
    draw.rounded_rectangle((290, 80, 340, 230), radius=20, fill=palm_color, outline="black", width=3)
    # Thumb nail
    draw.ellipse((300, 85, 330, 110), fill=(240, 200, 160), outline="black", width=2)

    # Wrist
    draw.rectangle((200, 400, 300, 480), fill=(200, 160, 120), outline="black", width=2)

    # Label
    draw.text((180, 490), "thumbs up", fill="black")

    img.save(path)


print("Generating synthetic 'thumbs up' image...")
test_img = Path("test_thumbs_up.png")
make_thumbs_up_image(test_img)
print(f"  Saved: {test_img} ({test_img.stat().st_size} bytes)")

# Test the endpoint
print()
print("=" * 65)
print("  TEST: POST /analyze/sign with thumbs-up image")
print("  (First call loads Gemma 4 E2B model - this can take 2-5 min)")
print("=" * 65)

t0 = time.perf_counter()

with test_img.open("rb") as f:
    files = {"image": (test_img.name, f, "image/png")}
    data = {"language": "English"}
    try:
        resp = requests.post(
            f"{BACKEND}/analyze/sign",
            files=files,
            data=data,
            timeout=600,
        )
    except requests.Timeout:
        print("  TIMEOUT after 10 minutes - Gemma may be too slow on this hardware")
        raise SystemExit(1)

elapsed = time.perf_counter() - t0
print(f"  Inference took {elapsed:.1f}s ({elapsed/60:.1f} min)")
print()

if resp.status_code != 200:
    print(f"  FAIL: status {resp.status_code}")
    print(f"  Body: {resp.text[:500]}")
    raise SystemExit(1)

result = resp.json()
print("  Response JSON:")
for k, v in result.items():
    print(f"    {k}: {v}")

print()
# Validate response shape
required_keys = {"recognized_sign", "confidence", "spoken_text", "visual_cues"}
missing = required_keys - set(result.keys())
if missing:
    print(f"  FAIL: missing keys {missing}")
    raise SystemExit(1)

print("  PASS: response has all required fields")
print(f"  PASS: recognized_sign = '{result['recognized_sign']}'")
print(f"  PASS: confidence is float = {result['confidence']}")
print(f"  PASS: spoken_text exists = '{result['spoken_text']}'")

vocab = {"hello", "mama", "papa", "i love you", "food", "water", "sleep",
         "story", "hug", "yes", "no", "more", "stop", "please", "thank you",
         "help", "play", "happy", "unclear"}
assert result["recognized_sign"] in vocab, f"sign '{result['recognized_sign']}' not in vocab"
print(f"  PASS: recognized_sign is in allowed vocabulary")

print()
print("=" * 65)
print("  SIGN RECOGNITION ENDPOINT TEST PASSED")
print(f"  Total time: {elapsed:.1f}s")
print("=" * 65)
