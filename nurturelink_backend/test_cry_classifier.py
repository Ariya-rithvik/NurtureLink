from cry_classifier import (
    BabyCryClassifier,
    CryClassificationResult,
    CryPrediction,
    normalize_cry_label,
)


def test_normalize_cry_label():
    assert normalize_cry_label("Hunger") == "hunger"
    assert normalize_cry_label("tiredness") == "tired"
    assert normalize_cry_label("belly_pain") == "gas"
    assert normalize_cry_label("burping") == "burping"
    assert normalize_cry_label("DISCOMFORT") == "discomfort"


def test_parse_predictions_sorts_by_score():
    raw = [
        {"label": "hunger", "score": 0.4},
        {"label": "tiredness", "score": 0.8},
        {"label": "belly_pain", "score": 0.6},
    ]

    parsed = BabyCryClassifier._parse_predictions(raw)

    assert parsed[0].label == "tired"
    assert parsed[0].score == 0.8
    assert parsed[1].label == "gas"


def test_parse_predictions_ignores_malformed_items():
    raw = [
        {"label": "hunger", "score": 0.9},
        {"label": 123, "score": 0.5},
        {"label": "pain", "score": "bad"},
        "bad",
    ]

    parsed = BabyCryClassifier._parse_predictions(raw)

    assert len(parsed) == 1
    assert parsed[0].label == "hunger"


def test_cry_result_prompt_text():
    result = CryClassificationResult(
        top_label="hunger",
        confidence=0.82,
        model_id="test-model",
        predictions=[
            CryPrediction(label="hunger", score=0.82),
            CryPrediction(label="discomfort", score=0.11),
        ],
    )

    text = result.to_prompt_text()

    assert "top_label=hunger" in text
    assert "confidence=0.82" in text


def test_cry_result_evidence():
    result = CryClassificationResult(
        top_label="gas",
        confidence=0.73,
        model_id="test-model",
        predictions=[
            CryPrediction(label="gas", score=0.73),
            CryPrediction(label="pain", score=0.20),
        ],
    )

    evidence = result.to_evidence()

    assert "gas" in evidence[0]
    assert "0.73" in evidence[0]
