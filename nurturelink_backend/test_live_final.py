"""Final live test with the new hybrid classifier."""
import time
import numpy as np
import sounddevice as sd
import soundfile as sf
from pathlib import Path
from cry_classifier import BabyCryClassifier

DURATION = 7
SAMPLE_RATE = 16000

print("=" * 55)
print("  PLAY BABY CRY VIDEO NOW - VOLUME MAX!")
print("  (hunger cry, tired cry, pain cry - any type)")
print("=" * 55)
print()

for i in range(12, 0, -1):
    print(f"  Recording starts in {i}...", flush=True)
    time.sleep(1)

print()
print(f"RECORDING {DURATION} seconds...")
audio = sd.rec(int(DURATION * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32")
sd.wait()

out = Path("test_live_final.wav")
sf.write(str(out), audio, SAMPLE_RATE)
peak = np.max(np.abs(audio))
rms = np.sqrt(np.mean(audio ** 2))
print(f"Done! Peak: {peak:.4f}, RMS: {rms:.6f}")

if peak < 0.01:
    print("WARNING: Very quiet recording!")
print()

print("Analyzing with new hybrid classifier...")
classifier = BabyCryClassifier()
result = classifier.classify(out)

print()
print("=" * 55)
if result.is_baby_cry:
    print(f"  BABY CRY DETECTED!")
    print(f"  Reason: {result.top_label.upper()}")
    print(f"  Confidence: {result.confidence:.0%}")
else:
    print(f"  NOT A BABY CRY (or too quiet to detect)")
print("=" * 55)
print()
print("All predictions:")
for pred in result.predictions:
    bar = "#" * int(pred.score * 30)
    print(f"  {pred.label:<12} {pred.score:.2%}  {bar}")
