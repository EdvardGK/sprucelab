"""
Unit tests for VerificationEngine — claim-derived rule path.

Covers:
  - ``_load_rules`` reads ``config['claim_derived_rules']`` and merges entries
    that have a ``check`` key with defaults
  - Entries without a ``check`` key are skipped silently (forward-compat for
    Sprint 6.3 LLM predicates we haven't translated yet)
  - The new ``claim_subject_match`` check type emits an info issue when the
    subject regex matches a type's name, and returns ``None`` when it doesn't
  - Operator-authored rules in ``verification.rules`` override claim rules
    with the same ``id`` (operator wins)
  - ``_`` -prefixed audit keys (``_claim_id``, ``_normalized``, etc.) are
    stripped before the rule is handed to ``_check_rule``
"""
from __future__ import annotations

import pytest

from apps.entities.services.verification_engine import (
    DEFAULT_RULES,
    VerificationEngine,
    VerificationIssue,
)
from apps.projects.models import Project, ProjectConfig


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_with_config(db):
    project = Project.objects.create(name="verify-engine-test", description="pytest")
    cfg = ProjectConfig.objects.create(project=project, version=1, is_active=True, config={})
    return project, cfg


def _claim_rule_entry(*, claim_id: str, subject_pattern: str, value: str = "REI60"):
    """Mimic what the translator + promotion service write into config."""
    return {
        "id": f"claim:{claim_id}",
        "name": f"Fire resistance: {value}",
        "severity": "info",
        "check": "claim_subject_match",
        "target": "type",
        "subject_field": "type_name",
        "subject_pattern": subject_pattern,
        "claim_value": value,
        "claim_units": "class",
        "claim_statement": "Fire walls shall be REI60.",
        # Audit metadata that should be stripped by _load_rules
        "_claim_id": claim_id,
        "_promoted_at": "2026-04-29T12:00:00+00:00",
        "_normalized": {"predicate": "fire_resistance_class", "subject": "fire walls"},
        "_statement": "Fire walls shall be REI60.",
    }


# ---------------------------------------------------------------------------
# _load_rules
# ---------------------------------------------------------------------------


def test_load_rules_includes_claim_derived_rules(project_with_config):
    project, cfg = project_with_config
    cfg.config = {
        "claim_derived_rules": [
            _claim_rule_entry(claim_id="abc-1", subject_pattern=r"\bfire walls\b"),
        ],
    }
    cfg.save()

    rules = VerificationEngine()._load_rules(str(project.id))

    rule_ids = [r["id"] for r in rules]
    assert "claim:abc-1" in rule_ids
    # Defaults still present
    for default in DEFAULT_RULES:
        assert default["id"] in rule_ids


def test_load_rules_strips_underscore_audit_keys(project_with_config):
    project, cfg = project_with_config
    cfg.config = {
        "claim_derived_rules": [
            _claim_rule_entry(claim_id="abc-2", subject_pattern=r"\bwalls\b"),
        ],
    }
    cfg.save()

    rules = VerificationEngine()._load_rules(str(project.id))
    claim_rule = next(r for r in rules if r["id"] == "claim:abc-2")

    # The rule the engine sees should not carry the audit metadata.
    for k in claim_rule:
        assert not k.startswith("_"), f"audit key leaked into rule: {k}"


def test_load_rules_skips_entries_without_check_key(project_with_config):
    """Pre-Sprint-6.3 entries (or untranslatable predicates) lack a ``check``
    key. The engine must skip them silently — no error, no issue.
    """
    project, cfg = project_with_config
    cfg.config = {
        "claim_derived_rules": [
            # Translated entry — should be picked up
            _claim_rule_entry(claim_id="ok", subject_pattern=r"\bwalls\b"),
            # Pre-translator entry — no `check`
            {"_claim_id": "legacy", "predicate": "color_code", "value": "RAL 9003"},
            # Garbage shape — skipped without raising
            "this is not a dict",
            None,
        ],
    }
    cfg.save()

    rules = VerificationEngine()._load_rules(str(project.id))
    rule_ids = [r["id"] for r in rules]
    assert "claim:ok" in rule_ids
    # Legacy/no-check entry must NOT have leaked in.
    assert all(r.get("_claim_id") != "legacy" for r in rules)


def test_load_rules_operator_override_wins(project_with_config):
    """If `verification.rules` defines a rule with the same id as a claim
    rule, the operator version wins (last-merged on collision).
    """
    project, cfg = project_with_config
    cfg.config = {
        "claim_derived_rules": [
            _claim_rule_entry(claim_id="x", subject_pattern=r"\bwalls\b", value="REI60"),
        ],
        "verification": {
            "rules": [
                {
                    "id": "claim:x",
                    "name": "Operator override",
                    "severity": "warning",
                    "check": "has_field",
                    "target": "mapping",
                    "field": "ns3451_code",
                },
            ],
        },
    }
    cfg.save()

    rules = VerificationEngine()._load_rules(str(project.id))
    [hit] = [r for r in rules if r["id"] == "claim:x"]
    assert hit["check"] == "has_field"
    assert hit["severity"] == "warning"
    assert hit["name"] == "Operator override"


def test_load_rules_empty_claim_section(project_with_config):
    project, cfg = project_with_config
    cfg.config = {}  # nothing configured
    cfg.save()

    rules = VerificationEngine()._load_rules(str(project.id))
    rule_ids = {r["id"] for r in rules}
    # Just defaults — and none of them are claim:* ids.
    assert all(not rid.startswith("claim:") for rid in rule_ids)


# ---------------------------------------------------------------------------
# _check_rule — claim_subject_match branch
# ---------------------------------------------------------------------------


class _StubType:
    def __init__(self, type_name: str):
        self.type_name = type_name


def _claim_subject_rule():
    return {
        "id": "claim:abc",
        "name": "Fire resistance: REI60",
        "severity": "info",
        "check": "claim_subject_match",
        "target": "type",
        "subject_field": "type_name",
        "subject_pattern": r"\bfire walls\b",
        "claim_value": "REI60",
        "claim_units": "class",
        "claim_statement": "Fire walls shall be REI60.",
    }


def test_check_rule_claim_subject_match_hit():
    engine = VerificationEngine()
    issue = engine._check_rule(
        _claim_subject_rule(), _StubType("Concrete fire walls 200mm"), None, [],
    )
    assert isinstance(issue, VerificationIssue)
    assert issue.rule_id == "claim:abc"
    assert issue.severity == "info"
    assert "REI60" in issue.message
    assert "Fire walls shall be REI60." in issue.message


def test_check_rule_claim_subject_match_no_hit():
    engine = VerificationEngine()
    issue = engine._check_rule(
        _claim_subject_rule(), _StubType("Concrete columns C30/37"), None, [],
    )
    assert issue is None


def test_check_rule_claim_subject_match_case_insensitive():
    engine = VerificationEngine()
    issue = engine._check_rule(
        _claim_subject_rule(), _StubType("FIRE WALLS — outer leaf"), None, [],
    )
    assert isinstance(issue, VerificationIssue)


def test_check_rule_claim_subject_match_truncates_long_statement():
    engine = VerificationEngine()
    rule = _claim_subject_rule()
    rule["claim_statement"] = "x" * 500
    issue = engine._check_rule(rule, _StubType("fire walls"), None, [])
    assert issue is not None
    # Message should contain the truncation ellipsis, not the full 500 chars.
    assert "..." in issue.message
    assert len(issue.message) < 500


def test_check_rule_claim_subject_match_invalid_regex_returns_none():
    engine = VerificationEngine()
    rule = _claim_subject_rule()
    rule["subject_pattern"] = "(unbalanced"
    # Bad regex shouldn't crash the engine — just skip the rule for this type.
    assert engine._check_rule(rule, _StubType("fire walls"), None, []) is None


def test_check_rule_claim_subject_match_missing_pattern_returns_none():
    engine = VerificationEngine()
    rule = _claim_subject_rule()
    rule.pop("subject_pattern")
    assert engine._check_rule(rule, _StubType("fire walls"), None, []) is None
