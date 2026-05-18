"""
Quick test: record 5s from laptop mic, then run the cry classifier.
Play a baby crying YouTube video near the laptop before running this.
"""
import sys
import time
import numpy as np
import sounddevice as sd
import soundfile as sf
from pathlib import Path

from cry_classifier import BabyCryClassifier

DURATION = 5  # seconds
SAMPLE_RATE = 16000
OUTPUT_FILE = Path("test_cry_recording.wav")


def main():
    print(f"Recording {DURATION}s from default mic at {SAMPLE_RATE} Hz...")
    print(">>> PLAY THE BABY CRY VIDEO NOW <<<")
    print()

    time.sleep(1)  # small buffer so user can start playback

    audio = sd.rec(
        int(DURATION * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
    )
    sd.wait()

    sf.write(str(OUTPUT_FILE), audio, SAMPLE_RATE)
    print(f"Saved recording to: {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size} bytes)")
    print()

    peak = np.max(np.abs(audio))
    print(f"Peak amplitude: {peak:.4f}")
    if peak < 0.01:
        print("WARNING: Audio is nearly silent. Check your mic or volume.")
        print()

    print("Loading cry classifier model...")
    classifier = BabyCryClassifier()
    result = classifier.classify(OUTPUT_FILE)

    print()
    print("=" * 50)
    print(f"  TOP LABEL:   {result.top_label}")
    print(f"  CONFIDENCE:  {result.confidence:.2%}")
    print(f"  MODEL:       {result.model_id}")
    print("=" * 50)
    print()
    print("All predictions:")
    for pred in result.predictions:
        bar = "#" * int(pred.score * 30)
        print(f"  {pred.label:<12} {pred.score:.3f}  {bar}")

    print()
    if result.confidence > 0.5:
        print(f"RESULT: Baby cry detected as '{result.top_label}' with high confidence!")
    elif result.confidence > 0.3:
        print(f"RESULT: Possible '{result.top_label}' detected (moderate confidence).")
    else:
        print("RESULT: Low confidence - may not be a clear baby cry.")


if __name__ == "__main__":
    main()
