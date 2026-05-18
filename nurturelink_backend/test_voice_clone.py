"""Test Coqui XTTS-v2 voice cloning end-to-end.
First run downloads ~2GB model. Subsequent runs use cached weights.
"""
import os
from pathlib import Path

# Suppress noisy logs
os.environ["COQUI_TOS_AGREED"] = "1"

from TTS.api import TTS

REFERENCE_VOICE = "cry_samples/hungry.wav"
OUTPUT = "voice_clone_test.wav"
TEXT = "Hello sweet baby, mommy loves you. Are you hungry or just tired?"

print("Initializing XTTS-v2 (downloads ~2GB on first run)...")
tts = TTS(
    model_name="tts_models/multilingual/multi-dataset/xtts_v2",
    progress_bar=True,
).to("cpu")

print()
print(f"Cloning voice from: {REFERENCE_VOICE}")
print(f"Synthesizing text:  {TEXT!r}")
print()

tts.tts_to_file(
    text=TEXT,
    speaker_wav=REFERENCE_VOICE,
    language="en",
    file_path=OUTPUT,
)

out_path = Path(OUTPUT)
print()
print(f"Output: {out_path.absolute()}")
print(f"Size:   {out_path.stat().st_size} bytes")
print()
print("Play the file to hear the cloned voice!")
