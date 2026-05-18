"""Download a real baby cry sample and test models with clean audio (no mic)."""
import urllib.request
import numpy as np
import librosa
import soundfile as sf
from pathlib import Path
from transformers import pipeline

# Use the donateacry-corpus on GitHub (public domain baby cry samples)
# These are actual labeled baby cries
SAMPLES = {
    "hungry": "https://github.com/gveres/donateacry-corpus/raw/master/donateacry_corpus_cleaned_and_updated_data/hungry/5A612653-B967-44CE-B0D0-B0A5C8D37E63-1430049835-1.0-m-26-hu.wav",
    "belly_pain": "https://github.com/gveres/donateacry-corpus/raw/master/donateacry_corpus_cleaned_and_updated_data/belly_pain/0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-bp.wav",
    "tired": "https://github.com/gveres/donateacry-corpus/raw/master/donateacry_corpus_cleaned_and_updated_data/tired/0C7E4058-0B4A-4B00-B51F-E2C7E96AC107-1436891863-1.1-m-72-ti.wav",
    "discomfort": "https://github.com/gveres/donateacry-corpus/raw/master/donateacry_corpus_cleaned_and_updated_data/discomfort/01BFEE66-1B1E-437F-B4CF-1DCBF7E9D460-1436093076-1.0-m-72-dc.wav",
    "burping": "https://github.com/gveres/donateacry-corpus/raw/master/donateacry_corpus_cleaned_and_updated_data/burping/0601E2B1-AA25-47ED-B4E8-EDB7CECC5BE9-1436972882-1.0-m-72-bu.wav",
}

print("Downloading real baby cry samples from donateacry-corpus...")
print()

downloaded = {}
for label, url in SAMPLES.items():
    out_path = Path(f"sample_{label}.wav")
    try:
        urllib.request.urlretrieve(url, str(out_path))
        # Resample to 16kHz mono for the models
        y, sr = librosa.load(str(out_path), sr=16000, mono=True)
        sf.write(str(out_path), y, 16000)
        downloaded[label] = str(out_path)
        print(f"  Downloaded: {label} ({out_path.stat().st_size} bytes, {len(y)/16000:.1f}s)")
    except Exception as e:
        print(f"  FAILED {label}: {e}")

if not downloaded:
    print("No samples downloaded. Check internet connection.")
    exit(1)

# Test with Wiam model
print()
print("Loading Wiam baby cry model...")
cry_pipe = pipeline(
    "audio-classification",
    model="Wiam/baby-cry-classification-finetuned-babycry-v4",
    device_map="auto",
)

print()
print("=" * 60)
print(f"  {'ACTUAL LABEL':<15} {'PREDICTED':<15} {'CONF':<8} {'CORRECT?'}")
print("=" * 60)

correct = 0
total = 0
for actual_label, path in downloaded.items():
    result = cry_pipe(path, top_k=5)
    predicted = result[0]["label"]
    conf = result[0]["score"]
    match = "YES" if predicted == actual_label else "NO"
    if predicted == actual_label:
        correct += 1
    total += 1
    print(f"  {actual_label:<15} {predicted:<15} {conf:.3f}    {match}")

print()
print(f"Accuracy: {correct}/{total} = {correct/total*100:.0f}%")

# Also test with AST
print()
print("Loading MIT AST model...")
ast_pipe = pipeline(
    "audio-classification",
    model="MIT/ast-finetuned-audioset-10-10-0.4593",
)

print()
print("=" * 60)
print("  AST results on real baby cry samples:")
print("=" * 60)
for actual_label, path in downloaded.items():
    result = ast_pipe(path, top_k=3)
    top3 = ", ".join(f"{r['label']}({r['score']:.2f})" for r in result[:3])
    print(f"  {actual_label:<15} -> {top3}")
