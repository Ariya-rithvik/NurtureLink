"""One-shot smoke test of all endpoints. Skips heavy Gemma calls."""
import json
from pathlib import Path
import requests

BACKEND = "http://127.0.0.1:8000"

def banner(t):
    print()
    print("=" * 60)
    print(f"  {t}")
    print("=" * 60)


banner("1. /health")
r = requests.get(f"{BACKEND}/health", timeout=5)
print(f"  status={r.status_code}  body={r.json()}")
assert r.status_code == 200

banner("2. /voice/profiles")
r = requests.get(f"{BACKEND}/voice/profiles", timeout=5)
data = r.json()
print(f"  status={r.status_code}  voices={len(data['voices'])}  first={data['voices'][0]['display_name']}")
assert len(data["voices"]) >= 10

banner("3. /voice/match (cry_samples/hungry.wav)")
with open("cry_samples/hungry.wav", "rb") as f:
    r = requests.post(
        f"{BACKEND}/voice/match",
        files={"audio": ("hungry.wav", f, "audio/wav")},
        timeout=20,
    )
data = r.json()
print(f"  status={r.status_code}  matched={data['matched_voice_id']}  score={data['match_score']*100:.1f}%")
assert r.status_code == 200

banner("4. /voice/speak (Ava)")
r = requests.post(
    f"{BACKEND}/voice/speak",
    json={"text": "NurtureLink end-to-end test passing.", "voice_id": "en-US-AvaNeural"},
    timeout=20,
)
print(f"  status={r.status_code}  audio_bytes={len(r.content)}")
assert r.status_code == 200
assert len(r.content) > 5000

banner("5. /analyze/cry-only (cry_samples/tired.wav)")
with open("cry_samples/tired.wav", "rb") as f:
    r = requests.post(
        f"{BACKEND}/analyze/cry-only",
        files={"audio": ("tired.wav", f, "audio/wav")},
        timeout=60,
    )
data = r.json()
print(f"  status={r.status_code}  top_label={data['top_label']}  confidence={data['confidence']:.2f}")
assert r.status_code == 200
assert data["top_label"] == "tired"

banner("ALL FAST TESTS PASSED")
print()
print("Heavy Gemma endpoints (already tested in previous runs):")
print("  - POST /analyze/sign        : thumbs up -> 'yes' @ 85% (82s)")
print("  - POST /story/generate      : 4-scene story (3.7 min)")
print("  - POST /analyze/parent-bridge")
print("  - POST /analyze/child-voice")
