"""
Unit tests for the heuristic claim extractor (Phase 6, Sprint 6.2).

Pure-function tests over the FastAPI ``services.claim_extractor`` module.
No Django DB. Covers the predicate patterns, NB/EN normative-verb anchors,
past-tense rejection branch, and confidence calibration.
"""
from __future__ import annotations

import pytest

from services.claim_extractor import extract_claims, _split_sentences


def _by_predicate(result):
    return {c.normalized.get("predicate"): c for c in result.claims}


# ---------------------------------------------------------------------------
# English patterns
# ---------------------------------------------------------------------------


def test_extracts_fire_resistance_class_en():
    result = extract_claims("External walls shall be REI60 in fire compartments.")
    assert result.success
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.claim_type == "rule"
    assert c.normalized["predicate"] == "fire_resistance_class"
    assert c.normalized["value"] == "REI60"
    assert c.normalized["units"] == "class"
    assert c.normalized["lang"] == "en"
    assert "External walls" in c.normalized["subject"]
    assert c.confidence >= 0.85


def test_extracts_flow_rate_en():
    result = extract_claims("Fresh air shall be at least 7.0 L/s per person.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["predicate"] == "flow_rate"
    assert c.normalized["value"] == 7.0
    assert c.normalized["units"] == "l/s"


def test_extracts_u_value_en():
    result = extract_claims("U-value must not exceed 0.18 W/m2K for external walls.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["predicate"] == "u_value"
    assert c.normalized["value"] == 0.18
    assert c.normalized["units"] == "W/m2K"


def test_extracts_acoustic_db_en():
    result = extract_claims("Internal walls shall be at least 50 dB(A) acoustic class.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["predicate"] == "acoustic_db"
    assert c.normalized["value"] == 50.0
    assert c.normalized["units"] == "dB"


# ---------------------------------------------------------------------------
# Norwegian patterns
# ---------------------------------------------------------------------------


def test_extracts_fire_resistance_class_nb():
    result = extract_claims("Vegger i branncelle skal vaere REI60.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["predicate"] == "fire_resistance_class"
    assert c.normalized["value"] == "REI60"
    assert c.normalized["lang"] == "nb"


def test_extracts_minst_anchor_nb():
    result = extract_claims("Innetemperaturen skal minst vaere 21 m i lengde.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["lang"] == "nb"
    assert c.normalized["predicate"] == "dimension"


def test_extracts_minimum_anchor_with_value_before_verb():
    result = extract_claims("Minimum 7 l/s per person ventilation shall be provided.")
    assert len(result.claims) == 1
    c = result.claims[0]
    assert c.normalized["predicate"] == "flow_rate"
    # Subject is fuzzier when value appears before verb — confidence drops.
    assert c.confidence < 0.92


# ---------------------------------------------------------------------------
# Negative / rejection cases
# ---------------------------------------------------------------------------


def test_rejects_past_tense_sentences():
    md = (
        "External walls were REI60 historically.\n"
        "The standard had been at least 7 l/s in 2010.\n"
    )
    result = extract_claims(md)
    assert result.claims == []


def test_rejects_normative_verb_without_measurable_value():
    """A sentence with 'shall' but no value+unit triple stays silent."""
    result = extract_claims(
        "All deliverables shall comply with the project standard."
    )
    assert result.claims == []


def test_rejects_pure_heading_or_empty_input():
    assert extract_claims("").claims == []
    assert extract_claims("   \n\n   ").claims == []
    # A heading line alone — no normative anchor in the heading text.
    assert extract_claims("## Specification").claims == []


# ---------------------------------------------------------------------------
# Multi-claim corpus
# ---------------------------------------------------------------------------


def test_corpus_extracts_all_predicate_kinds():
    md = """## Specification

Vegger i branncelle skal vaere REI60.
Walls in fire compartments must be REI60.
Minimum 7 l/s per person fresh air shall be provided.
U-value shall not exceed 0.18 W/m2K for external walls.
Internal walls shall be at least 50 dB acoustic class.
External walls were REI60 historically.
"""
    result = extract_claims(md)
    by_pred = _by_predicate(result)
    # All four predicates should be covered. Two REI60 claims share the
    # fire_resistance_class predicate; the dict overwrites to the EN one.
    assert "fire_resistance_class" in by_pred
    assert "flow_rate" in by_pred
    assert "u_value" in by_pred
    assert "acoustic_db" in by_pred
    assert result.quality_report["claim_count"] == len(result.claims)
    # Past-tense sentence must not produce a claim.
    assert all("historically" not in c.statement for c in result.claims)


# ---------------------------------------------------------------------------
# Sentence splitter
# ---------------------------------------------------------------------------


def test_split_sentences_keeps_offsets_aligned():
    md = "First sentence. Second normative sentence.\n## Heading\n- Bullet item."
    sents = _split_sentences(md)
    # Two sentences in line 1, heading text on line 2 (without ##),
    # bullet text on line 3 (without leading dash).
    texts = [s["text"] for s in sents]
    assert "First sentence." in texts
    assert "Second normative sentence." in texts
    assert "Heading" in texts
    assert "Bullet item." in texts
    # Char offsets must point back to slices that contain the sentence text.
    for s in sents:
        slice_text = md[s["char_start"]:s["char_end"]]
        assert s["text"].rstrip(".") in slice_text or s["text"] in slice_text
