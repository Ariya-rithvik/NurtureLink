"""Test models with REAL labeled baby cry samples from donateacry corpus."""
import librosa
import soundfile as sf
from pathlib import Path
from transformers import pipeline

samples_dir = Path("cry_samples")

# Prep: resample all to 16kHz
for wav in samples_dir.glob("*.wav"):
    y, sr = librosa.load(str(wav), sr=16000, mono=True)
    sf.write(str(wav), y, 16000)

samples = {
    "hungry": str(samples_dir / "hungry.wav"),
    "belly_pain": str(samples_dir / "belly_pain.wav"),
    "tired": str(samples_dir / "tired.wav"),
    "discomfort": str(samples_dir / "discomfort.wav"),
    "burping": str(samples_dir / "burping.wav"),
}

# --- Test Wiam model ---
print("Loading Wiam baby cry classifier...")
cry_pipe = pipeline(
    "audio-classification",
    model="Wiam/baby-cry-classification-finetuned-babycry-v4",
    device_map="auto",
)

print()
print("=" * 65)
print("  WIAM MODEL TEST (with REAL labeled donateacry samples)")
print("=" * 65)
print(f"  {'TRUE LABEL':<15} {'PREDICTED':<15} {'CONF':<8} {'MATCH?'}")
print("-" * 65)

correct = 0
for true_label, path in samples.items():
    result = cry_pipe(path, top_k=5)
    pred = result[0]["label"]
    conf = result[0]["score"]
    match = "YES" if pred == true_label else "NO"
    if pred == true_label:
        correct += 1
    print(f"  {true_label:<15} {pred:<15} {conf:.3f}    {match}")

print(f"\n  Accuracy: {correct}/5 = {correct*20}%")

# --- Test MIT AST ---
print()
print("Loading MIT AST model...")
ast_pipe = pipeline(
    "audio-classification",
    model="MIT/ast-finetuned-audioset-10-10-0.4593",
)

print()
print("=" * 65)
print("  MIT AST TEST (does it at least detect baby crying?)")
print("=" * 65)
for true_label, path in samples.items():
    result = ast_pipe(path, top_k=5)
    top5 = [r["label"] for r in result[:5]]
    has_cry = any("cry" in l.lower() or "baby" in l.lower() or "infant" in l.lower() or "whimper" in l.lower() for l in top5)
    top = result[0]
    print(f"  {true_label:<15} -> {top['label']} ({top['score']:.2f})")
    if has_cry:
        cry_items = [r for r in result if "cry" in r["label"].lower() or "baby" in r["label"].lower()]
        for c in cry_items:
            print(f"                    * {c['label']} ({c['score']:.3f})")
