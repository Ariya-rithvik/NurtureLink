"""
NurtureLink Voice Service.

Provides:
- A curated catalogue of natural neural voices (free, via Microsoft Edge TTS).
- Voice-matching: analyse a reference recording (e.g. mother's voice) and
  recommend the catalogue voice that best matches her pitch range and pace.
- Synthesis: produce speech audio in the selected voice profile.

Used by EyeBridge, SignSpeak, StoryWeaver to give the parent's chosen voice
to the AI's spoken output.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import edge_tts
import librosa
import numpy as np


CURATED_VOICES: list[dict[str, Any]] = [
    {
        "id": "en-US-AvaNeural",
        "display_name": "Ava (US)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 210,
        "personality": "Caring, expressive, warm",
        "accent": "American",
    },
    {
        "id": "en-US-EmmaNeural",
        "display_name": "Emma (US)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 225,
        "personality": "Cheerful, clear",
        "accent": "American",
    },
    {
        "id": "en-US-JennyNeural",
        "display_name": "Jenny (US)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 195,
        "personality": "Calm, friendly",
        "accent": "American",
    },
    {
        "id": "en-US-AriaNeural",
        "display_name": "Aria (US)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 220,
        "personality": "Confident, positive",
        "accent": "American",
    },
    {
        "id": "en-GB-SoniaNeural",
        "display_name": "Sonia (UK)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 200,
        "personality": "Warm British accent",
        "accent": "British",
    },
    {
        "id": "en-GB-LibbyNeural",
        "display_name": "Libby (UK)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 230,
        "personality": "Bright British",
        "accent": "British",
    },
    {
        "id": "en-IN-NeerjaNeural",
        "display_name": "Neerja (India)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 215,
        "personality": "Friendly Indian English",
        "accent": "Indian",
    },
    {
        "id": "en-IN-NeerjaExpressiveNeural",
        "display_name": "Neerja Expressive (India)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 220,
        "personality": "Expressive Indian English",
        "accent": "Indian",
    },
    {
        "id": "en-AU-NatashaNeural",
        "display_name": "Natasha (Australia)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 205,
        "personality": "Friendly Australian",
        "accent": "Australian",
    },
    {
        "id": "en-CA-ClaraNeural",
        "display_name": "Clara (Canada)",
        "gender": "Female",
        "age_band": "adult",
        "pitch_hint": 210,
        "personality": "Friendly Canadian",
        "accent": "Canadian",
    },
    {
        "id": "en-US-AnaNeural",
        "display_name": "Ana (US — younger)",
        "gender": "Female",
        "age_band": "young",
        "pitch_hint": 260,
        "personality": "Cute, youthful",
        "accent": "American",
    },
    {
        "id": "en-US-GuyNeural",
        "display_name": "Guy (US)",
        "gender": "Male",
        "age_band": "adult",
        "pitch_hint": 130,
        "personality": "Friendly father voice",
        "accent": "American",
    },
    {
        "id": "en-US-DavisNeural",
        "display_name": "Davis (US)",
        "gender": "Male",
        "age_band": "adult",
        "pitch_hint": 120,
        "personality": "Calm father voice",
        "accent": "American",
    },
    {
        "id": "en-GB-RyanNeural",
        "display_name": "Ryan (UK)",
        "gender": "Male",
        "age_band": "adult",
        "pitch_hint": 125,
        "personality": "Warm British father",
        "accent": "British",
    },
]


@dataclass(frozen=True)
class VoiceAnalysis:
    mean_pitch_hz: float
    pitch_std_hz: float
    estimated_gender: str
    speaking_rate_per_sec: float
    duration_sec: float


@dataclass(frozen=True)
class VoiceMatchResult:
    matched_voice_id: str
    match_score: float
    analysis: VoiceAnalysis
    alternatives: list[dict[str, Any]]


def _ensure_wav(audio_path: Path) -> Path:
    """If the upload is webm/opus/m4a (browser MediaRecorder), convert to WAV."""
    suffix = audio_path.suffix.lower()
    if suffix in {".wav", ".flac", ".ogg", ".mp3"}:
        return audio_path

    try:
        import imageio_ffmpeg
        from pydub import AudioSegment

        AudioSegment.converter = imageio_ffmpeg.get_ffmpeg_exe()
        seg = AudioSegment.from_file(str(audio_path))
        out = audio_path.with_suffix(".converted.wav")
        seg.export(str(out), format="wav")
        return out
    except Exception:
        # Fall through and let librosa try.
        return audio_path


def analyse_reference_voice(audio_path: Path) -> VoiceAnalysis:
    """Extract acoustic features from a reference recording."""
    audio_path = _ensure_wav(audio_path)
    y, sr = librosa.load(str(audio_path), sr=16000, mono=True)

    if len(y) < sr * 0.5:
        raise ValueError(
            "Reference recording is too short (need at least 0.5 seconds)."
        )

    rms = float(np.sqrt(np.mean(y ** 2)))
    peak = float(np.max(np.abs(y)))
    if peak < 0.005 or rms < 0.0008:
        raise ValueError(
            "No voice detected. Please speak louder, closer to the mic, "
            "or check that your microphone is unmuted."
        )

    pitches, magnitudes = librosa.piptrack(y=y, sr=sr, fmin=80, fmax=400)
    pitch_values = []
    for t in range(pitches.shape[1]):
        index = magnitudes[:, t].argmax()
        pitch = pitches[index, t]
        if pitch > 0:
            pitch_values.append(pitch)

    if not pitch_values:
        raise ValueError(
            "Could not detect a clear voice in the recording. Try again in a "
            "quieter environment and speak naturally for 10 seconds."
        )

    mean_pitch = float(np.mean(pitch_values))
    pitch_std = float(np.std(pitch_values))

    if mean_pitch < 165:
        gender = "Male"
    else:
        gender = "Female"

    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    duration = float(len(y) / sr)
    rate = float(len(onsets) / duration) if duration > 0 else 0.0

    return VoiceAnalysis(
        mean_pitch_hz=mean_pitch,
        pitch_std_hz=pitch_std,
        estimated_gender=gender,
        speaking_rate_per_sec=rate,
        duration_sec=duration,
    )


def match_voice(audio_path: Path) -> VoiceMatchResult:
    """Pick the curated voice that best matches the speaker."""
    analysis = analyse_reference_voice(audio_path)

    scored = []
    for voice in CURATED_VOICES:
        if voice["gender"] != analysis.estimated_gender:
            continue

        pitch_diff = abs(voice["pitch_hint"] - analysis.mean_pitch_hz)
        score = max(0.0, 1.0 - (pitch_diff / 100.0))
        scored.append((score, voice))

    if not scored:
        # Fallback: any voice
        scored = [(0.0, CURATED_VOICES[0])]

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_voice = scored[0]

    alternatives = [
        {**voice, "match_score": score}
        for score, voice in scored[1:5]
    ]

    return VoiceMatchResult(
        matched_voice_id=best_voice["id"],
        match_score=float(best_score),
        analysis=analysis,
        alternatives=alternatives,
    )


async def _synthesize_async(text: str, voice_id: str, output_path: Path) -> None:
    communicate = edge_tts.Communicate(text, voice_id)
    await communicate.save(str(output_path))


def synthesize(text: str, voice_id: str, output_path: Path) -> Path:
    """Produce audio from text using the chosen voice."""
    if not text.strip():
        raise ValueError("Text to synthesize cannot be empty.")

    valid_ids = {v["id"] for v in CURATED_VOICES}
    if voice_id not in valid_ids:
        raise ValueError(f"Unknown voice id: {voice_id}")

    asyncio.run(_synthesize_async(text, voice_id, output_path))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("Voice synthesis produced no output.")

    return output_path


def list_voices() -> list[dict[str, Any]]:
    return CURATED_VOICES.copy()


def voice_analysis_to_dict(analysis: VoiceAnalysis) -> dict[str, Any]:
    return asdict(analysis)


def match_result_to_dict(result: VoiceMatchResult) -> dict[str, Any]:
    return {
        "matched_voice_id": result.matched_voice_id,
        "match_score": result.match_score,
        "analysis": voice_analysis_to_dict(result.analysis),
        "alternatives": result.alternatives,
    }
