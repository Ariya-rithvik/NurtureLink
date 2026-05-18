from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

from PIL import Image, ImageDraw

from gemma_analyzer import GemmaAnalyzer, MODEL_ID


def create_test_wav(path: Path, seconds: float = 1.5, sample_rate: int = 16000) -> None:
    sample_count = int(seconds * sample_rate)
    amplitude = 12000

    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)

        frames = bytearray()
        for index in range(sample_count):
            tone = math.sin(2 * math.pi * 880 * index / sample_rate)
            envelope = 0.45 + 0.55 * math.sin(2 * math.pi * 5 * index / sample_rate)
            sample = int(amplitude * envelope * tone)
            frames.extend(sample.to_bytes(2, byteorder="little", signed=True))

        audio.writeframes(bytes(frames))


def create_test_image(path: Path) -> None:
    image = Image.new("RGB", (512, 512), color=(248, 246, 241))
    draw = ImageDraw.Draw(image)
    draw.ellipse((156, 92, 356, 292), fill=(244, 196, 167), outline=(85, 68, 58), width=4)
    draw.ellipse((207, 168, 227, 188), fill=(45, 38, 35))
    draw.ellipse((285, 168, 305, 188), fill=(45, 38, 35))
    draw.arc((225, 205, 287, 250), start=10, end=170, fill=(100, 66, 60), width=5)
    draw.rounded_rectangle((118, 286, 394, 444), radius=42, fill=(157, 197, 220), outline=(65, 92, 111), width=4)
    draw.text((138, 456), "NurtureLink smoke input", fill=(45, 45, 45))
    image.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a real Gemma 4 multimodal smoke test through the NurtureLink analyzer."
    )
    parser.add_argument("--work-dir", default=".smoke", help="Directory for generated test media.")
    parser.add_argument("--last-fed", type=int, default=210)
    parser.add_argument("--last-diaper", type=int, default=130)
    parser.add_argument("--language", default="English")
    args = parser.parse_args()

    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    audio_path = work_dir / "test_cry.wav"
    image_path = work_dir / "test_baby.png"
    create_test_wav(audio_path)
    create_test_image(image_path)

    print(f"Loading real Gemma model: {MODEL_ID}")
    print(f"Audio: {audio_path.resolve()}")
    print(f"Image: {image_path.resolve()}")

    analyzer = GemmaAnalyzer()
    result = analyzer.analyze_parent_bridge(
        audio_path=audio_path,
        image_path=image_path,
        last_fed_minutes_ago=args.last_fed,
        last_diaper_minutes_ago=args.last_diaper,
        language=args.language,
    )

    print(result)


if __name__ == "__main__":
    main()
