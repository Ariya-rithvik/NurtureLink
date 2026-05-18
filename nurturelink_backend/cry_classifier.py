from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

DEFAULT_CRY_MODEL = "MIT/ast-finetuned-audioset-10-10-0.4593"


@dataclass(frozen=True)
class CryPrediction:
    label: str
    score: float


@dataclass(frozen=True)
class CryClassificationResult:
    top_label: str
    confidence: float
    predictions: list[CryPrediction]
    model_id: str
    is_baby_cry: bool

    def to_prompt_text(self) -> str:
        if not self.predictions:
            return "No specialist cry classification available."

        ranked = ", ".join(
            f"{item.label} ({item.score:.2f})" for item in self.predictions
        )

        return (
            f"Specialist baby cry classifier result: "
            f"is_baby_cry={self.is_baby_cry}, "
            f"top_label={self.top_label}, confidence={self.confidence:.2f}. "
            f"Top predictions: {ranked}."
        )

    def to_evidence(self) -> list[str]:
        if not self.predictions:
            return []

        evidence = []
        if self.is_baby_cry:
            evidence.append("Audio confirmed as baby cry by AST model")
        evidence.append(
            f"Cry reason analysis predicted {self.top_label} "
            f"with confidence {self.confidence:.2f}"
        )
        evidence.append(
            "Top cry classes: "
            + ", ".join(
                f"{item.label}={item.score:.2f}" for item in self.predictions[:3]
            )
        )
        return evidence


class BabyCryClassifier:
    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv(
            "NURTURELINK_CRY_MODEL",
            DEFAULT_CRY_MODEL,
        )
        self._ast_pipe = None

    def _load_ast_pipeline(self):
        if self._ast_pipe is not None:
            return self._ast_pipe

        from transformers import pipeline

        self._ast_pipe = pipeline(
            "audio-classification",
            model=self.model_id,
        )
        return self._ast_pipe

    def classify(self, audio_path: Path, top_k: int = 5) -> CryClassificationResult:
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file does not exist: {audio_path}")

        if audio_path.stat().st_size == 0:
            raise ValueError("Audio file is empty.")

        # Step 1: AST detection - is this a baby cry?
        ast_pipe = self._load_ast_pipeline()
        ast_result = ast_pipe(str(audio_path), top_k=10)

        cry_labels = {"baby cry, infant cry", "crying, sobbing", "whimper", "wail, moan"}
        cry_score = sum(
            item["score"] for item in ast_result
            if item["label"].lower() in cry_labels
        )
        is_baby_cry = cry_score > 0.2

        # Step 2: Feature-based reason classification
        reason_predictions = self._classify_cry_reason(audio_path)

        if not is_baby_cry:
            reason_predictions = [CryPrediction(label="unknown", score=1.0)]

        top = reason_predictions[0]

        return CryClassificationResult(
            top_label=top.label,
            confidence=top.score if is_baby_cry else 0.0,
            predictions=reason_predictions,
            model_id=self.model_id,
            is_baby_cry=is_baby_cry,
        )

    def _classify_cry_reason(self, audio_path: Path) -> list[CryPrediction]:
        """Classify cry reason using acoustic features tuned on donateacry corpus."""
        import librosa

        y, sr = librosa.load(str(audio_path), sr=16000, mono=True)

        if len(y) < sr:
            return [CryPrediction(label="unknown", score=1.0)]

        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)

        mean_pitch = np.mean(pitch_values) if pitch_values else 300.0
        pitch_std = np.std(pitch_values) if pitch_values else 0.0

        rms = librosa.feature.rms(y=y)[0]
        mean_rms = np.mean(rms)
        rms_std = np.std(rms)

        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mean_zcr = np.mean(zcr)

        onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
        duration = len(y) / sr
        onset_rate = len(onsets) / duration if duration > 0 else 0

        if len(onsets) >= 3:
            intervals = np.diff(onsets)
            onset_regularity = 1.0 / (1.0 + np.std(intervals))
        else:
            onset_regularity = 0.0

        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        mean_centroid = np.mean(centroid)

        # Tuned on donateacry corpus feature analysis:
        # Hungry:     pitch~569, RMS~0.001, ZCR~0.16, onsets~5.5/s, centroid~1533
        # Belly_pain: pitch~911, RMS~0.020, ZCR~0.14, onsets~6.0/s, centroid~1435
        # Tired:      pitch~963, RMS~0.096, ZCR~0.16, onsets~6.1/s, centroid~1592
        # Discomfort: pitch~729, RMS~0.153, ZCR~0.12, onsets~6.1/s, centroid~1339
        # Burping:    pitch~1999, RMS~0.173, ZCR~0.27, onsets~3.2/s, centroid~2185

        scores = {}

        # Hungry: LOW pitch (<700), LOW energy, regular rhythm
        hunger_score = 0.0
        if mean_pitch < 700:
            hunger_score += 0.35
        if mean_rms < 0.02:
            hunger_score += 0.30
        if onset_regularity > 0.8:
            hunger_score += 0.20
        if onset_rate > 4.0:
            hunger_score += 0.15
        scores["hunger"] = hunger_score

        # Belly pain / gas: mid pitch (800-1100), low-mid energy, regular
        gas_score = 0.0
        if 750 < mean_pitch < 1200:
            gas_score += 0.30
        if 0.005 < mean_rms < 0.05:
            gas_score += 0.30
        if onset_regularity > 0.85:
            gas_score += 0.20
        if mean_centroid < 1500:
            gas_score += 0.20
        scores["gas"] = gas_score

        # Tired: high pitch (900-1100), moderate energy, regular
        tired_score = 0.0
        if 850 < mean_pitch < 1200:
            tired_score += 0.25
        if 0.05 < mean_rms < 0.15:
            tired_score += 0.30
        if mean_zcr > 0.14:
            tired_score += 0.20
        if onset_rate > 5.0:
            tired_score += 0.15
        if mean_centroid > 1500:
            tired_score += 0.10
        scores["tired"] = tired_score

        # Discomfort: moderate pitch (600-850), HIGH energy, lower ZCR
        discomfort_score = 0.0
        if 600 < mean_pitch < 900:
            discomfort_score += 0.25
        if mean_rms > 0.10:
            discomfort_score += 0.30
        if mean_zcr < 0.13:
            discomfort_score += 0.20
        if onset_rate > 5.0:
            discomfort_score += 0.15
        if pitch_std < 400:
            discomfort_score += 0.10
        scores["discomfort"] = discomfort_score

        # Burping: VERY high pitch (>1500), high ZCR, fewer onsets, bright
        burping_score = 0.0
        if mean_pitch > 1500:
            burping_score += 0.30
        if mean_zcr > 0.20:
            burping_score += 0.25
        if onset_rate < 4.0:
            burping_score += 0.20
        if mean_centroid > 2000:
            burping_score += 0.15
        if mean_rms > 0.10:
            burping_score += 0.10
        scores["burping"] = burping_score

        # Normalize
        total = sum(scores.values())
        if total > 0:
            scores = {k: v / total for k, v in scores.items()}
        else:
            scores = {k: 0.2 for k in scores}

        predictions = [
            CryPrediction(label=label, score=score)
            for label, score in sorted(scores.items(), key=lambda x: x[1], reverse=True)
        ]

        return predictions


def normalize_cry_label(label: str) -> str:
    cleaned = label.strip().lower()
    cleaned = cleaned.replace("_", " ").replace("-", " ")

    label_map = {
        "belly pain": "gas",
        "stomach pain": "gas",
        "gas": "gas",
        "burping": "gas",
        "burp": "gas",
        "discomfort": "discomfort",
        "uncomfortable": "discomfort",
        "hunger": "hunger",
        "hungry": "hunger",
        "tired": "tired",
        "tiredness": "tired",
        "sleepy": "tired",
        "pain": "pain",
        "crying": "unknown",
        "unknown": "unknown",
    }

    return label_map.get(cleaned, cleaned)
