from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from cry_classifier import CryClassificationResult
from safe_json import (
    extract_json_object,
    normalize_assessment,
    normalize_child_checkin,
    normalize_sign,
    normalize_story,
)

DEFAULT_LOCAL_MODEL = Path(__file__).resolve().parent / ".models" / "gemma-4-E2B-it"
MODEL_ID = os.getenv(
    "NURTURELINK_GEMMA_MODEL",
    str(DEFAULT_LOCAL_MODEL) if DEFAULT_LOCAL_MODEL.exists() else "google/gemma-4-E2B-it",
)
OFFLOAD_DIR = os.getenv("NURTURELINK_GEMMA_OFFLOAD_DIR", ".offload")
CPU_MAX_MEMORY = os.getenv("NURTURELINK_GEMMA_CPU_MAX_MEMORY", "10GiB")
MAX_NEW_TOKENS = int(os.getenv("NURTURELINK_GEMMA_MAX_NEW_TOKENS", "512"))


SYSTEM_PROMPT = """
You are NurtureLink, a careful caregiver-assistive AI.

Rules:
- Never claim certainty.
- Use phrases like "may be", "appears", "could indicate".
- Do not diagnose disease.
- Do not claim abuse detection.
- If the situation may be urgent, recommend caregiver check or professional help.
- Return ONLY valid JSON.
"""


def build_parent_bridge_prompt(
    last_fed_minutes_ago: int,
    last_diaper_minutes_ago: int,
    language: str,
    cry_hint: CryClassificationResult | None,
) -> str:
    cry_hint_text = (
        cry_hint.to_prompt_text()
        if cry_hint is not None
        else "No specialist cry classifier result available."
    )

    return f"""
Analyze the baby cry audio, baby image, caregiver context, and specialist cry classifier result.

Specialist audio evidence:
{cry_hint_text}

Context:
- Last fed: {last_fed_minutes_ago} minutes ago
- Last diaper change: {last_diaper_minutes_ago} minutes ago
- Output language: {language}

Classify possible need:
- hunger
- tired
- discomfort
- gas
- burping
- pain
- unknown

Use the specialist classifier as evidence, but do not blindly trust it.
Combine audio, vision, and context.

Return exactly this JSON schema:

{{
  "likely_need": "hunger | tired | discomfort | gas | burping | pain | unknown",
  "confidence": 0.0,
  "distress_level": 0,
  "audio_evidence": ["short evidence from cry and specialist classifier"],
  "vision_evidence": ["short evidence from image"],
  "context_evidence": ["short evidence from context"],
  "parent_message": "careful message to parent",
  "suggested_action": "safe next action",
  "safety_note": "medical safety reminder"
}}
"""


SIGN_VOCABULARY = [
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
]


def build_sign_recognition_prompt(language: str) -> str:
    vocab = ", ".join(f'"{w}"' for w in SIGN_VOCABULARY)

    return f"""
Look at the image of a hand or hands making a gesture or sign.

Identify which simple gesture is being shown. Pick the SINGLE best match from
this short vocabulary used by parents who cannot speak:

{vocab}

Common visual cues:
- Open palm waving = "hello"
- Hand on cheek / cradle motion = "mama" or "sleep"
- Hand to mouth = "food" or "water"
- Hands crossed over chest = "i love you" or "hug"
- Thumbs up = "yes"
- Thumbs down = "no"
- Index finger pointing = pick "more" if pointing twice, "stop" if flat palm
- Both hands raised = "happy" or "play"
- Pressing palms together = "please" or "thank you"

If no hand is visible or the gesture is too unclear, return "unclear".
Output language for the spoken text: {language}.

Return exactly this JSON schema:

{{
  "recognized_sign": "one of the vocabulary words or 'unclear'",
  "confidence": 0.0,
  "spoken_text": "natural sentence in {language} that expresses the sign, e.g. 'I love you'",
  "visual_cues": ["short note about what you see"]
}}
"""


def build_story_prompt(
    child_age_years: int,
    theme: str,
    parent_voice_note: str,
    language: str,
) -> str:
    return f"""
Write a short, gentle bedtime story for a child.

Context:
- Child age: {child_age_years} years
- Theme: {theme}
- Caregiver note: {parent_voice_note}
- Output language: {language}

Rules:
- 4 short scenes (3-5 sentences each).
- Calm, warm, hopeful tone.
- Age-appropriate vocabulary.
- Each scene has a single visual description so an illustration can be drawn.

Return exactly this JSON schema:

{{
  "title": "short story title",
  "scenes": [
    {{
      "scene_number": 1,
      "narration": "what mother would read aloud",
      "illustration": "single short visual description"
    }}
  ],
  "closing_line": "short loving closing line",
  "safety_note": "gentle safety reminder for caregivers"
}}
"""


def build_child_voice_prompt(
    child_age_years: int,
    communication_style: str,
    caregiver_concern: str,
    language: str,
) -> str:
    return f"""
Analyze this child check-in image carefully and safely.

This is for a non-verbal or limited-verbal child wellbeing check-in.
The goal is to help caregivers notice possible visual changes or signs of discomfort.

Context:
- Child age: {child_age_years} years
- Communication style: {communication_style}
- Caregiver concern: {caregiver_concern}
- Output language: {language}

Important safety limits:
- Do NOT say abuse, assault, rape, or crime detected.
- Do NOT diagnose autism, trauma, or disease.
- Only describe visible cues and possible caregiver actions.
- Use cautious language: "may", "appears", "could".
- If concerning, recommend calm checking and professional support.

Return exactly this JSON schema:

{{
  "id": "short unique id",
  "timestamp": "",
  "status": "stable | mild_change | needs_attention | urgent_check | unclear",
  "confidence": 0.0,
  "emotional_state": "short cautious description",
  "visual_cues": ["visible cue 1", "visible cue 2"],
  "changes_detected": ["possible change 1"],
  "caregiver_message": "careful message for caregiver",
  "suggested_action": "safe next action",
  "safety_note": "safety reminder"
}}
"""


class GemmaAnalyzer:
    def __init__(self) -> None:
        self._model = None
        self._processor = None

    def _load_model_and_processor(self):
        if self._model is not None and self._processor is not None:
            return self._model, self._processor

        import torch
        from transformers import AutoModelForMultimodalLM, AutoProcessor

        self._processor = AutoProcessor.from_pretrained(
            MODEL_ID,
            padding_side="left",
        )
        model_kwargs: dict[str, Any] = {
            "device_map": "auto",
            "torch_dtype": torch.float16,
            "attn_implementation": "sdpa",
            "offload_folder": OFFLOAD_DIR,
            "low_cpu_mem_usage": True,
        }
        if CPU_MAX_MEMORY:
            model_kwargs["max_memory"] = {"cpu": CPU_MAX_MEMORY}

        self._model = AutoModelForMultimodalLM.from_pretrained(
            MODEL_ID,
            **model_kwargs,
        )
        return self._model, self._processor

    def warmup(self) -> dict[str, str]:
        self._load_model_and_processor()
        return {"status": "loaded", "model": MODEL_ID}

    def analyze_parent_bridge(
        self,
        audio_path: Path,
        image_path: Path,
        last_fed_minutes_ago: int,
        last_diaper_minutes_ago: int,
        language: str,
        cry_hint: CryClassificationResult | None = None,
    ) -> dict[str, Any]:
        prompt = build_parent_bridge_prompt(
            last_fed_minutes_ago=last_fed_minutes_ago,
            last_diaper_minutes_ago=last_diaper_minutes_ago,
            language=language,
            cry_hint=cry_hint,
        )

        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image", "image": str(image_path)},
                    {"type": "audio", "audio": str(audio_path)},
                ],
            },
        ]

        parsed = self._generate_json(messages)
        normalized = normalize_assessment(parsed)

        if cry_hint is not None:
            normalized["audio_evidence"] = [
                *cry_hint.to_evidence(),
                *normalized["audio_evidence"],
            ]

            if (
                normalized["likely_need"] == "unknown"
                and cry_hint.confidence >= 0.65
            ):
                normalized["likely_need"] = cry_hint.top_label
                normalized["confidence"] = min(0.65, cry_hint.confidence)

        return normalized

    def analyze_child_voice(
        self,
        image_path: Path,
        child_age_years: int,
        communication_style: str,
        caregiver_concern: str,
        language: str,
    ) -> dict[str, Any]:
        prompt = build_child_voice_prompt(
            child_age_years=child_age_years,
            communication_style=communication_style,
            caregiver_concern=caregiver_concern,
            language=language,
        )

        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image", "image": str(image_path)},
                ],
            },
        ]

        parsed = self._generate_json(messages)
        return normalize_child_checkin(parsed)

    def recognize_sign(
        self,
        image_path: Path,
        language: str = "English",
    ) -> dict[str, Any]:
        """Identify a simple sign-language gesture from an image."""
        prompt = build_sign_recognition_prompt(language=language)

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image", "image": str(image_path)},
                ],
            },
        ]

        parsed = self._generate_json(messages)
        return normalize_sign(parsed)

    def generate_story(
        self,
        child_age_years: int,
        theme: str,
        parent_voice_note: str,
        language: str = "English",
    ) -> dict[str, Any]:
        """Write a short illustrated bedtime story for a child."""
        prompt = build_story_prompt(
            child_age_years=child_age_years,
            theme=theme,
            parent_voice_note=parent_voice_note,
            language=language,
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        parsed = self._generate_json(messages)
        return normalize_story(parsed)

    def _generate_json(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        model, processor = self._load_model_and_processor()

        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        ).to(model.device, dtype=model.dtype)

        input_len = inputs["input_ids"].shape[-1]
        outputs = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
        )

        response = processor.decode(
            outputs[0][input_len:],
            skip_special_tokens=False,
            clean_up_tokenization_spaces=False,
        )

        raw_text = self._extract_generated_text(response, processor)
        try:
            return extract_json_object(raw_text)
        except Exception as error:
            raise ValueError(
                f"Gemma returned non-JSON output: {raw_text[:1000]}"
            ) from error

    @staticmethod
    def _extract_generated_text(result: Any, processor: Any | None = None) -> str:
        if processor is not None and hasattr(processor, "parse_response"):
            try:
                parsed_response = processor.parse_response(str(result))
                if isinstance(parsed_response, dict):
                    for key in (
                        "answer",
                        "content",
                        "text",
                        "generated_text",
                        "response",
                    ):
                        value = parsed_response.get(key)
                        if isinstance(value, str) and value.strip():
                            return value
                    for value in parsed_response.values():
                        if (
                            isinstance(value, str)
                            and "{" in value
                            and "}" in value
                        ):
                            return value
                if parsed_response is not None:
                    return str(parsed_response)
            except Exception:
                pass

        if isinstance(result, list) and result:
            first = result[0]
            if isinstance(first, dict):
                if "generated_text" in first:
                    return str(first["generated_text"])
                if "text" in first:
                    return str(first["text"])

        return str(result)
