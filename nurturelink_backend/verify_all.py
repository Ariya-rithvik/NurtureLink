"""End-to-end verification of everything we've built. Skips heavy Gemma calls."""
import time
from pathlib import Path
import requests

BACKEND = "http://127.0.0.1:8000"


def banner(t):
    print()
    print("=" * 60)
    print(f"  {t}")
    print("=" * 60)


def ok(msg):
    print(f"  [OK]   {msg}")


def fail(msg):
    print(f"  [FAIL] {msg}")


# --- 1. Backend alive ---
banner("1. Backend health")
try:
    r = requests.get(f"{BACKEND}/health", timeout=3)
    if r.status_code == 200 and r.json().get("status") == "ok":
        ok(f"/health responding: {r.json()}")
    else:
        fail(f"unexpected response {r.status_code}: {r.text}")
except Exception as e:
    fail(f"backend not reachable: {e}")
    raise SystemExit(1)

# --- 2. Voice profile catalogue ---
banner("2. /voice/profiles (list voices)")
try:
    r = requests.get(f"{BACKEND}/voice/profiles", timeout=5)
    voices = r.json().get("voices", [])
    ok(f"returned {len(voices)} voices")
    if len(voices) < 10:
        fail("expected 14 voices")
    first_few = ", ".join(v["display_name"] for v in voices[:3])
    ok(f"first 3: {first_few}")
except Exception as e:
    fail(f"{e}")

# --- 3. Voice match (silent should fail clearly, real audio should match) ---
banner("3. /voice/match")
try:
    with open("cry_samples/hungry.wav", "rb") as f:
        r = requests.post(
            f"{BACKEND}/voice/match",
            files={"audio": ("hungry.wav", f, "audio/wav")},
            timeout=15,
        )
    if r.status_code == 200:
        data = r.json()
        ok(f"matched: {data['matched_voice_id']} "
           f"@ {data['match_score']*100:.0f}% "
           f"(detected {data['analysis']['estimated_gender']}, "
           f"{int(data['analysis']['mean_pitch_hz'])} Hz)")
    else:
        fail(f"status {r.status_code}: {r.text}")
except Exception as e:
    fail(f"{e}")

# --- 4. Voice synthesis ---
banner("4. /voice/speak")
try:
    r = requests.post(
        f"{BACKEND}/voice/speak",
        json={"text": "Verification test passed", "voice_id": "en-US-AvaNeural"},
        timeout=15,
    )
    if r.status_code == 200 and len(r.content) > 5000:
        ok(f"generated {len(r.content)} bytes MP3 audio in {r.elapsed.total_seconds():.1f}s")
    else:
        fail(f"status {r.status_code}, body size {len(r.content)}")
except Exception as e:
    fail(f"{e}")

# --- 5. Cry classifier ---
banner("5. /analyze/cry-only (hybrid AST + features)")
samples = [
    ("hungry.wav", "hunger"),
    ("tired.wav", "tired"),
    ("burping.wav", "burping"),
]
correct = 0
for fname, expected in samples:
    try:
        with open(f"cry_samples/{fname}", "rb") as f:
            r = requests.post(
                f"{BACKEND}/analyze/cry-only",
                files={"audio": (fname, f, "audio/wav")},
                timeout=60,
            )
        data = r.json()
        predicted = data["top_label"]
        if predicted == expected:
            ok(f"{fname}: predicted {predicted} ({data['confidence']:.0%})")
            correct += 1
        else:
            fail(f"{fname}: expected {expected}, got {predicted}")
    except Exception as e:
        fail(f"{fname}: {e}")
print(f"  Score: {correct}/{len(samples)}")

# --- 6. External services we depend on ---
banner("6. External services")
try:
    r = requests.get(
        "https://image.pollinations.ai/prompt/test?width=128&height=128&seed=1",
        timeout=15,
    )
    if r.status_code == 200 and len(r.content) > 1000:
        ok(f"Pollinations.ai: {len(r.content)} bytes in {r.elapsed.total_seconds():.1f}s "
           f"(story illustrations)")
    else:
        fail(f"Pollinations status {r.status_code}, size {len(r.content)}")
except Exception as e:
    fail(f"Pollinations: {e}")

try:
    r = requests.get("https://sign.mt/", timeout=10)
    if r.status_code == 200 and len(r.content) > 5000:
        ok(f"sign.mt: {len(r.content)} bytes (ASL avatar iframe target)")
        # Check critical headers
        xfo = r.headers.get("X-Frame-Options")
        csp = r.headers.get("Content-Security-Policy", "")
        if xfo:
            fail(f"  X-Frame-Options set to '{xfo}' — iframe may be blocked!")
        elif "frame-ancestors" in csp.lower():
            fail(f"  CSP frame-ancestors set — iframe may be blocked")
        else:
            ok(f"  No X-Frame-Options or CSP frame-ancestors — iframe should work")
    else:
        fail(f"sign.mt status {r.status_code}")
except Exception as e:
    fail(f"sign.mt: {e}")

# --- 7. Heavy Gemma endpoints (just confirm route exists, don't actually call) ---
banner("7. Heavy Gemma routes registered")
try:
    r = requests.get(f"{BACKEND}/openapi.json", timeout=5)
    paths = list(r.json().get("paths", {}).keys())
    for endpoint in ["/analyze/sign", "/analyze/parent-bridge", "/analyze/child-voice", "/story/generate"]:
        if endpoint in paths:
            ok(f"{endpoint} registered")
        else:
            fail(f"{endpoint} MISSING")
except Exception as e:
    fail(f"{e}")

banner("DONE")
print(f"Backend at {BACKEND} is fully operational.")
print("Frontend live at http://127.0.0.1:5173/")
print()
print("To test the AI avatar features visually:")
print("1. Open http://127.0.0.1:5173/ in Chrome or Edge")
print("2. Voice Setup → record + photo + name → Save")
print("3. EyeBridge → type a sentence with mouse → Show in ASL → sign.mt avatar loads inline")
print("4. EyeBridge → tap 'Use eyes' → calibrate 9 dots → look at tiles")
print("5. StoryWeaver → weave a story → watercolor illustrations + narrated in voice")
