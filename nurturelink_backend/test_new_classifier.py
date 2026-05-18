"""Test the new hybrid classifier (AST + feature analysis)."""
import librosa
import soundfile as sf
from pathlib import Path
from cry_classifier import BabyCryClassifier

samples_dir = Path("cry_samples")

# Resample
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

classifier = BabyCryClassifier()

print()
print("=" * 70)
print("  NEW HYBRID CLASSIFIER (AST detection + feature-based reason)")
print("=" * 70)
print(f"  {'TRUE LABEL':<14} {'BABY CRY?':<11} {'PREDICTED':<12} {'CONF':<7} ALL SCORES")
print("-" * 70)

for true_label, path in samples.items():
    result = classifier.classify(Path(path))
    scores_str = " | ".join(f"{p.label}:{p.score:.2f}" for p in result.predictions)
    print(f"  {true_label:<14} {'YES' if result.is_baby_cry else 'NO':<11} {result.top_label:<12} {result.confidence:.2f}   {scores_str}")

# Also test with non-cry audio
print()
print("-" * 70)
print("  NON-CRY AUDIO TESTS:")
print("-" * 70)

non_cry = {
    "silence": "test_silence.wav",
    "white_noise": "test_noise.wav",
}

for name, path in non_cry.items():
    if Path(path).exists():
        result = classifier.classify(Path(path))
        print(f"  {name:<14} {'YES' if result.is_baby_cry else 'NO':<11} {result.top_label:<12} {result.confidence:.2f}")
