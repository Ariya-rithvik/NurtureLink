"""Final test: record loud baby cry, test with BOTH models."""
import time
import numpy as np
import sounddevice as sd
import soundfile as sf
from pathlib import Path
from transformers import pipeline

DURATION = 7
SAMPLE_RATE = 16000

print("=" * 55)
print("  PLAY A BABY CRY YOUTUBE VIDEO NOW - VOLUME MAX!")
print("=" * 55)
print()

for i in range(15, 0, -1):
    print(f"  Recording starts in {i}...", flush=True)
    time.sleep(1)

print()
print(f"RECORDING {DURATION} seconds...")
audio = sd.rec(int(DURATION * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32")
sd.wait()

out = Path("test_loud_cry.wav")
sf.write(str(out), audio, SAMPLE_RATE)
peak = np.max(np.abs(audio))
rms = np.sqrt(np.mean(audio ** 2))
print(f"Done! Peak: {peak:.4f}, RMS: {rms:.4f}")

if peak < 0.02:
    print("PROBLEM: Audio is too quiet. Turn up volume or check mic!")
    print()

# --- Model 1: MIT AST (general audio) ---
print()
print("Loading MIT AST model...")
ast_pipe = pipeline(
    "audio-classification",
    model="MIT/ast-finetuned-audioset-10-10-0.4593",
)
ast_result = ast_pipe(str(out), top_k=10)

print()
print("=" * 55)
print("  MODEL 1: MIT AST (AudioSet - 527 classes)")
print("=" * 55)
for item in ast_result:
    bar = "#" * int(item["score"] * 40)
    print(f"  {item['label']:<35} {item['score']:.3f}  {bar}")

# --- Model 2: Wiam baby cry (for comparison) ---
print()
print("Loading Wiam cry model...")
cry_pipe = pipeline(
    "audio-classification",
    model="Wiam/baby-cry-classification-finetuned-babycry-v4",
    device_map="auto",
)
cry_result = cry_pipe(str(out), top_k=5)

print()
print("=" * 55)
print("  MODEL 2: Wiam Baby Cry Classifier")
print("=" * 55)
for item in cry_result:
    bar = "#" * int(item["score"] * 40)
    print(f"  {item['label']:<35} {item['score']:.3f}  {bar}")

print()
is_baby_cry = any(
    "cry" in item["label"].lower() or "baby" in item["label"].lower() or "infant" in item["label"].lower()
    for item in ast_result[:5]
)
if is_baby_cry:
    print("AST DETECTED BABY CRY!")
else:
    top = ast_result[0]["label"]
    print(f"AST top prediction: {top} (not baby cry)")
