"""Test /analyze/cry-only via HTTP with all labeled samples."""
import json
from pathlib import Path

import requests

BACKEND = "http://127.0.0.1:8000"
SAMPLES_DIR = Path("cry_samples")

samples = {
    "hungry": "hungry.wav",
    "belly_pain": "belly_pain.wav",
    "tired": "tired.wav",
    "discomfort": "discomfort.wav",
    "burping": "burping.wav",
}

print(f"{'TRUE LABEL':<14} {'PREDICTED':<14} {'CONFIDENCE':<12} {'MODEL':<55}")
print("-" * 100)

correct = 0
for true_label, filename in samples.items():
    path = SAMPLES_DIR / filename

    with path.open("rb") as f:
        files = {"audio": (filename, f, "audio/wav")}
        response = requests.post(
            f"{BACKEND}/analyze/cry-only",
            files=files,
            timeout=60,
        )

    if response.status_code != 200:
        print(f"{true_label:<14} ERROR {response.status_code}: {response.text[:80]}")
        continue

    data = response.json()
    predicted = data["top_label"]
    conf = data["confidence"]
    model = data["model_id"]

    # Alias mapping: model output -> donateacry label
    aliases = {
        ("hunger", "hungry"),
        ("gas", "belly_pain"),
    }
    is_correct = predicted == true_label or (predicted, true_label) in aliases
    if is_correct:
        correct += 1
    mark = "OK" if is_correct else "WRONG"
    print(f"{true_label:<14} {predicted:<14} {conf:<12.3f} {model[:55]:<55} {mark}")

print()
print(f"Accuracy via HTTP: {correct}/5 = {correct*20}%")
