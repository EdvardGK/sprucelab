"""
Unit tests for the Claim → engine-rule translator (Phase 6).

Pure-Python tests — no Django DB, no fixtures. The translator is a single
function that takes the Claim's normalized JSON and returns either an
engine-shape rule dict or ``None``.
"""
from __future__ import annotations

from apps.entities.services.claim_rule_translator import translate_claim_to_rule


CLAIM_ID = "11111111-2222-3333-4444-555555555555"


# ---------------------------------------------------------------------------
# Happy path: each supported predicate translates to engine-shape
# ---------------------------------------------------------------------------


def test_fire_resistance_translates_to_engine_rule():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {
            "predicate": "fire_resistance_class",
            "subject": "fire walls",
            "value": "REI60",
            "units": "class",
            "lang": "en",
        },
        "Fire walls shall be REI60.",
    )
    assert rule is not None
    assert rule["id"] == f"claim:{CLAIM_ID}"
    assert rule["check"] == "claim_subject_match"
    assert rule["target"] == "type"
    assert rule["subject_field"] == "type_name"
    assert rule["severity"] == "info"
    assert rule["claim_value"] == "REI60"
    assert rule["claim_units"] == "class"
    assert rule["claim_statement"] == "Fire walls shall be REI60."
    # Subject regex compiles and matches the original phrase case-insensitively.
    import re as _re
    compiled = _re.compile(rule["subject_pattern"], _re.IGNORECASE)
    assert compiled.search("Concrete fire walls 200mm")
    assert not compiled.search("Concrete columns")


def test_acoustic_db_translates():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "acoustic_db", "subject": "partition walls", "value": 50, "units": "dB"},
        "Partition walls shall be at least 50 dB.",
    )
    assert rule is not None
    assert rule["check"] == "claim_subject_match"
    assert rule["claim_value"] == "50"
    assert rule["claim_units"] == "dB"


def test_u_value_translates():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "u_value", "subject": "external walls", "value": 0.18, "units": "W/m2K"},
        "External walls shall have U ≤ 0.18 W/m2K.",
    )
    assert rule is not None
    assert rule["check"] == "claim_subject_match"
    assert rule["claim_value"] == "0.18"


def test_dimension_translates():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "dimension", "subject": "ceiling void", "value": 100, "units": "mm"},
        "Ceiling void shall be minimum 100 mm.",
    )
    assert rule is not None
    assert rule["check"] == "claim_subject_match"
    assert rule["claim_units"] == "mm"


def test_subject_pattern_is_word_bounded_and_escaped():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {
            "predicate": "fire_resistance_class",
            "subject": "wall (load-bearing)",
            "value": "REI60",
            "units": "class",
        },
        "stmt",
    )
    assert rule is not None
    # Special regex chars must be escaped so they don't blow up at compile time.
    pattern = rule["subject_pattern"]
    assert pattern.startswith(r"\b")
    assert pattern.endswith(r"\b")
    # The literal parens come through escaped, not as group-open/group-close.
    assert r"\(" in pattern and r"\)" in pattern


# ---------------------------------------------------------------------------
# Skip cases: return None
# ---------------------------------------------------------------------------


def test_unknown_predicate_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "color_code", "subject": "doors", "value": "RAL 9003", "units": ""},
        "Doors shall be RAL 9003.",
    )
    assert rule is None


def test_deferred_flow_rate_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "flow_rate", "subject": "office spaces", "value": 7, "units": "l/s"},
        "Office spaces shall have at least 7 l/s per person.",
    )
    assert rule is None


def test_deferred_pressure_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "pressure", "subject": "stairwell", "value": 50, "units": "Pa"},
        "Stairwell shall be pressurized to 50 Pa.",
    )
    assert rule is None


def test_empty_subject_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "fire_resistance_class", "subject": "", "value": "REI60", "units": "class"},
        "stmt",
    )
    assert rule is None


def test_unspecified_subject_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {
            "predicate": "fire_resistance_class",
            "subject": "(unspecified)",
            "value": "REI60",
            "units": "class",
        },
        "stmt",
    )
    assert rule is None


def test_missing_value_returns_none():
    rule = translate_claim_to_rule(
        CLAIM_ID,
        {"predicate": "fire_resistance_class", "subject": "walls", "value": None, "units": "class"},
        "stmt",
    )
    assert rule is None


def test_empty_normalized_returns_none():
    assert translate_claim_to_rule(CLAIM_ID, {}, "stmt") is None
