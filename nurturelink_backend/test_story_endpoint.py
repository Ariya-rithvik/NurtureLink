"""Test /story/generate endpoint (uses Gemma text generation)."""
import time
import requests

BACKEND = "http://127.0.0.1:8000"

print("=" * 65)
print("  TEST: POST /story/generate")
print("=" * 65)

payload = {
    "child_age_years": 4,
    "theme": "cozy bedtime story about a sleepy bunny",
    "parent_voice_note": "My child loves rabbits and the moon.",
    "language": "English",
}

print(f"  Theme:   {payload['theme']}")
print(f"  Age:     {payload['child_age_years']}")
print(f"  Note:    {payload['parent_voice_note']}")
print()
print("  Generating (Gemma writes the story — typically 30-90s)...")

t0 = time.perf_counter()
resp = requests.post(f"{BACKEND}/story/generate", json=payload, timeout=600)
elapsed = time.perf_counter() - t0

if resp.status_code != 200:
    print(f"  FAIL: status {resp.status_code}")
    print(f"  Body: {resp.text[:500]}")
    raise SystemExit(1)

story = resp.json()
print(f"  Done in {elapsed:.1f}s ({elapsed/60:.1f} min)")
print()
print("=" * 65)
print(f"  TITLE: {story['title']}")
print("=" * 65)

for scene in story["scenes"]:
    print(f"\n  Scene {scene['scene_number']}")
    print(f"  Narration: {scene['narration']}")
    print(f"  Illustration hint: {scene['illustration']}")

print(f"\n  CLOSING: {story['closing_line']}")
print(f"\n  Safety:  {story['safety_note']}")

# Validate response shape
required = {"title", "scenes", "closing_line", "safety_note"}
missing = required - set(story.keys())
assert not missing, f"missing keys: {missing}"
assert isinstance(story["scenes"], list), "scenes must be list"
assert len(story["scenes"]) >= 1, "must have at least 1 scene"

scene_keys = {"scene_number", "narration", "illustration"}
for i, scene in enumerate(story["scenes"]):
    m = scene_keys - set(scene.keys())
    assert not m, f"scene {i} missing {m}"

print()
print("=" * 65)
print("  STORY GENERATION TEST PASSED")
print(f"  {len(story['scenes'])} scenes generated, total time {elapsed:.1f}s")
print("=" * 65)

# Bonus: test error handling
print()
print("=" * 65)
print("  TEST: error handling (age out of range)")
print("=" * 65)
bad = {"child_age_years": 50, "theme": "test"}
resp = requests.post(f"{BACKEND}/story/generate", json=bad, timeout=10)
print(f"  Status {resp.status_code}: {resp.json()['detail']}")
assert resp.status_code == 400
print("  PASS: invalid age rejected")

print()
print("=" * 65)
print("  TEST: error handling (empty theme)")
print("=" * 65)
bad = {"child_age_years": 5, "theme": ""}
resp = requests.post(f"{BACKEND}/story/generate", json=bad, timeout=10)
print(f"  Status {resp.status_code}: {resp.json()['detail']}")
assert resp.status_code == 400
print("  PASS: empty theme rejected")
