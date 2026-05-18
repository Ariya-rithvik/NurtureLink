"""Test MIT AST model (properly trained on AudioSet) for baby cry detection."""
from transformers import pipeline

print("Loading MIT AST model (first time will download ~350MB)...")
pipe = pipeline(
    "audio-classification",
    model="MIT/ast-finetuned-audioset-10-10-0.4593",
)

files = [
    ("Your recorded baby cry", "test_cry_recording2.wav"),
    ("Silence", "test_silence.wav"),
    ("White noise", "test_noise.wav"),
]

for name, path in files:
    print(f"\n{'='*50}")
    print(f"  {name}")
    print(f"{'='*50}")
    result = pipe(path, top_k=10)
    for item in result:
        score = item["score"]
        label = item["label"]
        bar = "#" * int(score * 40)
        print(f"  {label:<35} {score:.3f}  {bar}")
