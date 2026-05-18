"""Test all voice endpoints end-to-end."""
import json
from pathlib import Path

import requests

BACKEND = "http://127.0.0.1:8000"

# Test 1: List profiles
print("=" * 65)
print("  TEST: GET /voice/profiles")
print("=" * 65)
resp = requests.get(f"{BACKEND}/voice/profiles", timeout=10)
assert resp.status_code == 200, f"Status {resp.status_code}"
voices = resp.json()["voices"]
print(f"  PASS: returned {len(voices)} voices")
female_voices = [v for v in voices if v["gender"] == "Female"]
male_voices = [v for v in voices if v["gender"] == "Male"]
print(f"        {len(female_voices)} female, {len(male_voices)} male")
print()

# Test 2: Voice match with a real audio sample
print("=" * 65)
print("  TEST: POST /voice/match (using cry_samples/hungry.wav)")
print("=" * 65)
sample_path = Path("cry_samples/hungry.wav")
with sample_path.open("rb") as f:
    files = {"audio": ("hungry.wav", f, "audio/wav")}
    resp = requests.post(f"{BACKEND}/voice/match", files=files, timeout=30)
assert resp.status_code == 200, f"Status {resp.status_code}: {resp.text}"
data = resp.json()
print(f"  PASS: matched voice = {data['matched_voice_id']}")
print(f"        confidence    = {data['match_score']*100:.1f}%")
print(f"        gender        = {data['analysis']['estimated_gender']}")
print(f"        pitch         = {data['analysis']['mean_pitch_hz']:.0f} Hz")
print(f"        rate          = {data['analysis']['speaking_rate_per_sec']:.1f} per sec")
print(f"        alternatives  = {len(data['alternatives'])} options")
print()

# Test 3: Synthesize a few different voices and text lengths
print("=" * 65)
print("  TEST: POST /voice/speak (4 different voices)")
print("=" * 65)
test_cases = [
    ("en-US-AvaNeural", "Hello my little one, mama loves you."),
    ("en-GB-SoniaNeural", "Time for a story before bed, darling."),
    ("en-IN-NeerjaNeural", "Eat your food, sweetheart."),
    ("en-US-AnaNeural", "Yay! You did it!"),
]

import io
import os
output_dir = Path("test_outputs")
output_dir.mkdir(exist_ok=True)

for voice_id, text in test_cases:
    payload = {"text": text, "voice_id": voice_id}
    resp = requests.post(f"{BACKEND}/voice/speak", json=payload, timeout=30)
    assert resp.status_code == 200, f"FAIL {voice_id}: {resp.status_code} {resp.text[:200]}"
    out = output_dir / f"speak_{voice_id}.mp3"
    out.write_bytes(resp.content)
    print(f"  PASS: {voice_id:<28} -> {out.name} ({len(resp.content)} bytes)")

# Test 4: Error handling - empty text
print()
print("=" * 65)
print("  TEST: POST /voice/speak with empty text (should reject)")
print("=" * 65)
resp = requests.post(f"{BACKEND}/voice/speak", json={"text": "", "voice_id": "en-US-AvaNeural"}, timeout=10)
print(f"  Status {resp.status_code}: {resp.json()['detail']}")
assert resp.status_code == 400, "Should reject empty text"
print("  PASS: empty text rejected as expected")

# Test 5: Error handling - bad voice id
print()
print("=" * 65)
print("  TEST: POST /voice/speak with unknown voice_id (should reject)")
print("=" * 65)
resp = requests.post(f"{BACKEND}/voice/speak", json={"text": "test", "voice_id": "fake-voice"}, timeout=10)
print(f"  Status {resp.status_code}: {resp.json()['detail']}")
assert resp.status_code == 400, "Should reject unknown voice"
print("  PASS: unknown voice rejected")

print()
print("=" * 65)
print("  ALL VOICE ENDPOINT TESTS PASSED")
print("=" * 65)
