"""Debug: see what acoustic features each cry type actually has."""
import librosa
import soundfile as sf
import numpy as np
from pathlib import Path

samples_dir = Path("cry_samples")

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

print(f"{'Label':<12} {'Pitch':<8} {'PitchStd':<9} {'RMS':<8} {'RMS_Std':<8} {'ZCR':<8} {'Onsets/s':<9} {'Regularity':<11} {'Centroid':<9}")
print("-" * 90)

for label, path in samples.items():
    y, sr = librosa.load(path, sr=16000, mono=True)
    duration = len(y) / sr

    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
    pitch_values = []
    for t in range(pitches.shape[1]):
        index = magnitudes[:, t].argmax()
        pitch = pitches[index, t]
        if pitch > 0:
            pitch_values.append(pitch)

    mean_pitch = np.mean(pitch_values) if pitch_values else 0
    pitch_std = np.std(pitch_values) if pitch_values else 0

    rms = librosa.feature.rms(y=y)[0]
    mean_rms = np.mean(rms)
    rms_std = np.std(rms)

    zcr = librosa.feature.zero_crossing_rate(y)[0]
    mean_zcr = np.mean(zcr)

    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    onset_rate = len(onsets) / duration

    if len(onsets) >= 3:
        intervals = np.diff(onsets)
        onset_regularity = 1.0 / (1.0 + np.std(intervals))
    else:
        onset_regularity = 0.0

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    mean_centroid = np.mean(centroid)

    print(f"{label:<12} {mean_pitch:<8.0f} {pitch_std:<9.0f} {mean_rms:<8.4f} {rms_std:<8.4f} {mean_zcr:<8.4f} {onset_rate:<9.2f} {onset_regularity:<11.3f} {mean_centroid:<9.0f}")
