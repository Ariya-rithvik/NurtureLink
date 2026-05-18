"""Test the cry model with different audio types to check for bias."""
import numpy as np
import soundfile as sf
from pathlib import Path
from transformers import pipeline

print("Loading model...")
pipe = pipeline(
    "audio-classification",
    model="Wiam/baby-cry-classification-finetuned-babycry-v4",
    device_map="auto",
)

# Test 1: silence
silence = np.zeros(16000 * 5, dtype=np.float32)
sf.write("test_silence.wav", silence, 16000)

# Test 2: white noise
rng = np.random.default_rng(42)
noise = (rng.standard_normal(16000 * 5) * 0.1).astype(np.float32)
sf.write("test_noise.wav", noise, 16000)

# Test 3: sine tone (baby-like 400Hz whine)
t = np.linspace(0, 5, 16000 * 5, dtype=np.float32)
whine = (np.sin(2 * np.pi * 400 * t) * 0.3).astype(np.float32)
sf.write("test_whine.wav", whine, 16000)

# Test 4: pulsing cry pattern (on-off at 2Hz, ~500Hz)
pulse = np.zeros_like(t)
for i in range(len(t)):
    if int(t[i] * 2) % 2 == 0:
        pulse[i] = np.sin(2 * np.pi * 500 * t[i]) * 0.3
sf.write("test_pulse.wav", pulse.astype(np.float32), 16000)

# Test 5: the actual recorded cry
actual_exists = Path("test_cry_recording2.wav").exists()

tests = [
    ("Silence", "test_silence.wav"),
    ("White noise", "test_noise.wav"),
    ("400Hz whine", "test_whine.wav"),
    ("Pulsing cry-like", "test_pulse.wav"),
]
if actual_exists:
    tests.append(("Your recorded baby cry", "test_cry_recording2.wav"))

print()
print(f"{'Test':<25} {'#1 Label':<14} {'#1 Score':<10} {'#2 Label':<14} {'#2 Score':<10}")
print("-" * 75)

for name, path in tests:
    result = pipe(path, top_k=5)
    r1 = result[0]
    r2 = result[1]
    print(f"{name:<25} {r1['label']:<14} {r1['score']:<10.3f} {r2['label']:<14} {r2['score']:<10.3f}")

print()
print("If all tests show the same top label, the model has a bias problem.")
