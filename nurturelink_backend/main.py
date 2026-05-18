from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from cry_classifier import BabyCryClassifier, CryClassificationResult
from gemma_analyzer import GemmaAnalyzer
import voice_service

app = FastAPI(title="NurtureLink Gemma Backend", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = GemmaAnalyzer()
cry_classifier = BabyCryClassifier()

VOICE_OUTPUT_DIR = Path("generated_audio")
VOICE_OUTPUT_DIR.mkdir(exist_ok=True)


class SpeakRequest(BaseModel):
    text: str
    voice_id: str


class StoryRequest(BaseModel):
    child_age_years: int
    theme: str
    parent_voice_note: str = ""
    language: str = "English"


def _safe_upload_path(temp_path: Path, prefix: str, filename: str | None) -> Path:
    suffix = Path(filename or "").suffix
    if not suffix or len(suffix) > 10:
        suffix = ".bin"
    return temp_path / f"{prefix}{suffix}"


@app.get("/health")
def health():
    return {"status": "ok", "service": "nurturelink-backend"}


@app.post("/health/model/load")
def load_model():
    try:
        return analyzer.warmup()
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Gemma model load failed: {error}",
        ) from error


@app.post("/analyze/cry-only")
async def analyze_cry_only(
    audio: UploadFile = File(...),
):
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        audio_path = _safe_upload_path(temp_path, "cry_audio", audio.filename)

        _save_upload(audio, audio_path)

        try:
            result = cry_classifier.classify(audio_path)
            return {
                "top_label": result.top_label,
                "confidence": result.confidence,
                "model_id": result.model_id,
                "predictions": [
                    {"label": item.label, "score": item.score}
                    for item in result.predictions
                ],
            }
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Cry specialist classification failed: {error}",
            ) from error


@app.post("/analyze/parent-bridge")
async def analyze_parent_bridge(
    audio: UploadFile = File(...),
    image: UploadFile = File(...),
    last_fed_minutes_ago: int = Form(...),
    last_diaper_minutes_ago: int = Form(...),
    language: str = Form("English"),
):
    if last_fed_minutes_ago < 0 or last_diaper_minutes_ago < 0:
        raise HTTPException(
            status_code=400,
            detail="Context minutes cannot be negative.",
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        audio_path = _safe_upload_path(temp_path, "cry_audio", audio.filename)
        image_path = _safe_upload_path(temp_path, "baby_image", image.filename)

        _save_upload(audio, audio_path)
        _save_upload(image, image_path)

        cry_hint: CryClassificationResult | None = None
        try:
            cry_hint = cry_classifier.classify(audio_path)
        except Exception:
            cry_hint = None

        try:
            return analyzer.analyze_parent_bridge(
                audio_path=audio_path,
                image_path=image_path,
                last_fed_minutes_ago=last_fed_minutes_ago,
                last_diaper_minutes_ago=last_diaper_minutes_ago,
                language=language,
                cry_hint=cry_hint,
            )
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Gemma parent bridge analysis failed: {error}",
            ) from error


@app.post("/analyze/child-voice")
async def analyze_child_voice(
    image: UploadFile = File(...),
    child_age_years: int = Form(...),
    communication_style: str = Form("non-verbal"),
    caregiver_concern: str = Form("Daily check-in."),
    language: str = Form("English"),
):
    if child_age_years < 1 or child_age_years > 18:
        raise HTTPException(
            status_code=400,
            detail="Child age must be between 1 and 18 years.",
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        image_path = _safe_upload_path(temp_path, "child_image", image.filename)

        _save_upload(image, image_path)

        try:
            return analyzer.analyze_child_voice(
                image_path=image_path,
                child_age_years=child_age_years,
                communication_style=communication_style,
                caregiver_concern=caregiver_concern,
                language=language,
            )
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Gemma child voice analysis failed: {error}",
            ) from error


@app.post("/analyze/sign")
async def analyze_sign(
    image: UploadFile = File(...),
    language: str = Form("English"),
):
    """Recognize a hand sign from a captured image using Gemma multimodal."""
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        image_path = _safe_upload_path(temp_path, "sign_image", image.filename)
        _save_upload(image, image_path)

        try:
            return analyzer.recognize_sign(
                image_path=image_path,
                language=language,
            )
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Sign recognition failed: {error}",
            ) from error


@app.post("/story/generate")
def generate_story(payload: StoryRequest):
    """Generate a short bedtime story with Gemma."""
    if payload.child_age_years < 1 or payload.child_age_years > 18:
        raise HTTPException(
            status_code=400,
            detail="child_age_years must be between 1 and 18.",
        )
    if not payload.theme.strip():
        raise HTTPException(status_code=400, detail="theme is required")

    try:
        return analyzer.generate_story(
            child_age_years=payload.child_age_years,
            theme=payload.theme,
            parent_voice_note=payload.parent_voice_note,
            language=payload.language,
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Story generation failed: {error}",
        ) from error


@app.get("/voice/profiles")
def list_voice_profiles():
    """Return the curated voice catalogue parents can pick from."""
    return {"voices": voice_service.list_voices()}


@app.post("/voice/match")
async def match_voice_to_recording(audio: UploadFile = File(...)):
    """Analyse a parent's recording and recommend the closest voice."""
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        audio_path = _safe_upload_path(temp_path, "voice_sample", audio.filename)
        _save_upload(audio, audio_path)

        try:
            result = voice_service.match_voice(audio_path)
            return voice_service.match_result_to_dict(result)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Voice matching failed: {error}",
            ) from error


@app.post("/voice/speak")
def speak_text(payload: SpeakRequest):
    """Produce audio of the supplied text in the chosen voice."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    if len(payload.text) > 1000:
        raise HTTPException(status_code=400, detail="text exceeds 1000 chars")

    file_name = f"speech_{uuid.uuid4().hex}.mp3"
    output_path = VOICE_OUTPUT_DIR / file_name

    try:
        voice_service.synthesize(payload.text, payload.voice_id, output_path)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Synthesis failed: {error}",
        ) from error

    return FileResponse(
        path=str(output_path),
        media_type="audio/mpeg",
        filename=file_name,
    )


def _save_upload(upload: UploadFile, destination: Path) -> None:
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)

    if destination.stat().st_size == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Uploaded file {upload.filename} is empty.",
        )
