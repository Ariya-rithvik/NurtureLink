import time
import numpy as np
import sounddevice as sd
import soundfile as sf
from pathlib import Path
from cry_classifier import BabyCryClassifier

print("You have 10 seconds to start playing a baby cry YouTube video...")
print("Make sure your laptop volume is UP and mic is NOT muted.")
print()

for i in range(10, 0, -1):
    print(f"  Recording starts in {i}...", flush=True)
    time.sleep(1)

print()
print("RECORDING NOW (5 seconds)...")
audio = sd.rec(int(5 * 16000), samplerate=16000, channels=1, dtype="float32")
sd.wait()

out = Path("test_cry_recording2.wav")
sf.write(str(out), audio, 16000)
peak = np.max(np.abs(audio))
print(f"Done. Peak amplitude: {peak:.4f}")
if peak < 0.01:
    print("WARNING: Audio is nearly silent! Check mic/volume.")
print()

print("Classifying...")
classifier = BabyCryClassifier()
result = classifier.classify(out)
print()
print("=" * 50)
print(f"  TOP LABEL:   {result.top_label}")
print(f"  CONFIDENCE:  {result.confidence:.2%}")
print("=" * 50)
for pred in result.predictions:
    bar = "#" * int(pred.score * 30)
    print(f"  {pred.label:<12} {pred.score:.3f}  {bar}")
