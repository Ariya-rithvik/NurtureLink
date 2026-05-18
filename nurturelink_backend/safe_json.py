import json
import re
from datetime import datetime, timezone
from typing import Any


def extract_json_object(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        raise ValueError("Empty model output.")

    cleaned = text.strip()
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)

    first = cleaned.find("{")
    last = cleaned.rfind("}")

    if first == -1 or last == -1 or first >= last:
        raise ValueError(f"No JSON object found in output: {text[:200]}")

    candidate = cleaned[first : last + 1]
    parsed = json.loads(candidate)

    if not isinstance(parsed, dict):
        raise ValueError("Parsed JSON is not an object.")

    return parsed


def normalize_assessment(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "likely_need": _safe_str(data, "likely_need", "unknown"),
        "confidence": _safe_float(data, "confidence"),
        "distress_level": _safe_int(
            data,
            "distress_level",
            minimum=0,
            maximum=10,
        ),
        "audio_evidence": _safe_list(data, "audio_evidence"),
        "vision_evidence": _safe_list(data, "vision_evidence"),
        "context_evidence": _safe_list(data, "context_evidence"),
        "parent_message": _safe_str(
            data,
            "parent_message",
            "Please check your baby calmly.",
        ),
        "suggested_action": _safe_str(
            data,
            "suggested_action",
            "Check feeding, diaper, temperature, position, and comfort.",
        ),
        "safety_note": _safe_str(
            data,
            "safety_note",
            "This is not a medical diagnosis. If breathing, skin color, or movement looks unusual, seek urgent help.",
        ),
    }


def normalize_child_checkin(data: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    allowed_statuses = {
        "stable",
        "mild_change",
        "needs_attention",
        "urgent_check",
        "unclear",
    }

    raw_status = data.get("status")
    status = raw_status.strip() if isinstance(raw_status, str) else "unclear"
    if status not in allowed_statuses:
        status = "unclear"

    return {
        "id": f"checkin_{int(now.timestamp() * 1000)}",
        "timestamp": now.isoformat().replace("+00:00", "Z"),
        "status": status,
        "confidence": _safe_float(data, "confidence"),
        "emotional_state": _safe_str(data, "emotional_state", "unclear"),
        "visual_cues": _safe_list(data, "visual_cues"),
        "changes_detected": _safe_list(data, "changes_detected"),
        "caregiver_message": _safe_str(
            data,
            "caregiver_message",
            "Something may be different today. Please check calmly and observe.",
        ),
        "suggested_action": _safe_str(
            data,
            "suggested_action",
            "Talk gently, check for discomfort, and continue observing changes.",
        ),
        "safety_note": _safe_str(
            data,
            "safety_note",
            "This is not a diagnosis or abuse detection. If you are concerned about safety, contact a trusted professional or emergency support.",
        ),
    }


SIGN_VOCAB_ALLOWED = {
    "hello",
    "mama",
    "papa",
    "i love you",
    "food",
    "water",
    "sleep",
    "story",
    "hug",
    "yes",
    "no",
    "more",
    "stop",
    "please",
    "thank you",
    "help",
    "play",
    "happy",
    "unclear",
}


def normalize_sign(data: dict[str, Any]) -> dict[str, Any]:
    raw_sign = data.get("recognized_sign")
    sign = raw_sign.strip().lower() if isinstance(raw_sign, str) else "unclear"
    if sign not in SIGN_VOCAB_ALLOWED:
        sign = "unclear"

    spoken_text = _safe_str(data, "spoken_text", "")
    if not spoken_text and sign != "unclear":
        spoken_text = sign.capitalize()

    return {
        "recognized_sign": sign,
        "confidence": _safe_float(data, "confidence"),
        "spoken_text": spoken_text,
        "visual_cues": _safe_list(data, "visual_cues"),
    }


def normalize_story(data: dict[str, Any]) -> dict[str, Any]:
    raw_scenes = data.get("scenes")
    scenes: list[dict[str, Any]] = []

    if isinstance(raw_scenes, list):
        for i, scene in enumerate(raw_scenes[:6]):
            if not isinstance(scene, dict):
                continue
            scenes.append({
                "scene_number": i + 1,
                "narration": _safe_str(scene, "narration", ""),
                "illustration": _safe_str(scene, "illustration", ""),
            })

    if not scenes:
        scenes = [{
            "scene_number": 1,
            "narration": "Once upon a time, a little one and their loved ones shared a quiet, gentle evening.",
            "illustration": "Cozy bedroom with soft warm light.",
        }]

    return {
        "title": _safe_str(data, "title", "A Gentle Story"),
        "scenes": scenes,
        "closing_line": _safe_str(
            data,
            "closing_line",
            "Goodnight, sweet one. You are loved.",
        ),
        "safety_note": _safe_str(
            data,
            "safety_note",
            "Stories are generated by AI. Adapt them as you see fit for your child.",
        ),
    }


def _safe_str(data: dict[str, Any], key: str, fallback: str) -> str:
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _safe_float(data: dict[str, Any], key: str) -> float:
    value = data.get(key)

    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))

    return 0.0


def _safe_int(
    data: dict[str, Any],
    key: str,
    minimum: int,
    maximum: int,
) -> int:
    value = data.get(key)

    if isinstance(value, (int, float)):
        return max(minimum, min(maximum, int(value)))

    return minimum


def _safe_list(data: dict[str, Any], key: str) -> list[str]:
    value = data.get(key)

    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    return []
