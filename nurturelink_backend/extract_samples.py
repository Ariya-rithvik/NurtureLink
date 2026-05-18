import zipfile
import shutil
from pathlib import Path

out_dir = Path("cry_samples")
out_dir.mkdir(exist_ok=True)

with zipfile.ZipFile("donateacry.zip", "r") as z:
    names = z.namelist()
    wavs = [n for n in names if n.endswith(".wav")]

    categories = {
        "hungry": "-hu.",
        "tired": "-ti.",
        "belly_pain": "-bp.",
        "discomfort": "-dc.",
        "burping": "-bu.",
    }

    for label, tag in categories.items():
        matches = [n for n in wavs if tag in n]
        if matches:
            chosen = matches[0]
            z.extract(chosen)
            dest = out_dir / f"{label}.wav"
            shutil.move(chosen, str(dest))
            print(f"{label}: extracted ({dest.stat().st_size} bytes)")
        else:
            print(f"{label}: NO SAMPLES FOUND")
