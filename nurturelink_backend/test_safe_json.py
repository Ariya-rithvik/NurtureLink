import pytest

from safe_json import (
    extract_json_object,
    normalize_assessment,
    normalize_child_checkin,
)


def test_extract_json_from_markdown_block():
    raw = """
```json
{
  "likely_need": "hunger",
  "confidence": 0.8,
  "distress_level": 6
}
```
"""
    parsed = extract_json_object(raw)

    assert parsed["likely_need"] == "hunger"
    assert parsed["confidence"] == 0.8


def test_normalize_assessment_clamps_values():
    result = normalize_assessment(
        {
            "likely_need": "pain",
            "confidence": 99,
            "distress_level": 100,
            "audio_evidence": ["sharp cry"],
        }
    )

    assert result["confidence"] == 1.0
    assert result["distress_level"] == 10
    assert result["audio_evidence"] == ["sharp cry"]


def test_extract_json_rejects_empty_output():
    with pytest.raises(ValueError):
        extract_json_object("")


def test_normalize_child_checkin_valid():
    result = normalize_child_checkin(
        {
            "status": "needs_attention",
            "confidence": 0.77,
            "emotional_state": "withdrawn",
            "visual_cues": ["reduced eye contact"],
            "changes_detected": ["less expressive than usual"],
        }
    )

    assert result["status"] == "needs_attention"
    assert result["confidence"] == 0.77
    assert result["emotional_state"] == "withdrawn"
    assert result["visual_cues"] == ["reduced eye contact"]


def test_normalize_child_checkin_rejects_unsafe_status():
    result = normalize_child_checkin(
        {
            "status": "abuse_detected",
            "confidence": 0.8,
        }
    )

    assert result["status"] == "unclear"


def test_normalize_child_checkin_clamps_confidence():
    result = normalize_child_checkin(
        {
            "status": "stable",
            "confidence": 50,
        }
    )

    assert result["confidence"] == 1.0


def test_child_checkin_safety_note_mentions_no_diagnosis():
    result = normalize_child_checkin({})

    assert "not a diagnosis" in result["safety_note"].lower()
