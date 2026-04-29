"""
Unit tests for the claim promotion service (Phase 6, Sprint 6.2).

Django DB tests over ``apps.entities.services.claim_promotion``. Covers
promote/reject/supersede paths, the dry-run branch, and the conflict
detection helper.
"""
from __future__ import annotations

import pytest

from apps.entities.models import Claim, DocumentContent
from apps.entities.services.claim_promotion import (
    CLAIM_DERIVED_RULES_SECTION,
    ClaimStateError,
    find_conflicts,
    promote_claim,
    reject_claim,
    supersede_claim,
)
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project, ProjectConfig


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_with_source_file(db):
    project = Project.objects.create(name="claim-promo-test", description="pytest")
    sf = SourceFile.objects.create(
        project=project,
        original_filename="spec.pdf",
        format="pdf",
        file_size=1234,
        checksum_sha256="0" * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status="completed")
    doc = DocumentContent.objects.create(
        source_file=sf,
        extraction_run=run,
        markdown_content="# Spec\n\nWalls shall be REI60.",
        extraction_method="text_layer",
    )
    return project, sf, run, doc


def _make_claim(
    sf, run, doc, *,
    statement="Walls shall be REI60.",
    predicate="fire_resistance_class",
    subject="Walls",
    value="REI60",
    units="class",
    confidence=0.92,
    status="unresolved",
):
    return Claim.objects.create(
        source_file=sf,
        document=doc,
        extraction_run=run,
        statement=statement,
        normalized={
            "predicate": predicate,
            "subject": subject,
            "value": value,
            "units": units,
            "lang": "en",
        },
        claim_type="rule",
        confidence=confidence,
        status=status,
    )


# ---------------------------------------------------------------------------
# Promote
# ---------------------------------------------------------------------------


def test_promote_writes_into_active_project_config(project_with_source_file):
    project, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)

    result = promote_claim(claim)
    assert result["dry_run"] is False
    assert result["status"] == "promoted"
    assert result["config_section"] == CLAIM_DERIVED_RULES_SECTION

    claim.refresh_from_db()
    assert claim.status == "promoted"
    assert claim.promoted_to_config is not None
    assert claim.config_section == CLAIM_DERIVED_RULES_SECTION
    assert claim.config_payload["_claim_id"] == str(claim.id)
    assert claim.decided_at is not None

    cfg = claim.promoted_to_config
    rules = cfg.config.get(CLAIM_DERIVED_RULES_SECTION)
    assert isinstance(rules, list) and len(rules) == 1
    entry = rules[0]
    assert entry["_claim_id"] == str(claim.id)
    assert entry["predicate"] == "fire_resistance_class"
    assert entry["value"] == "REI60"


def test_promote_creates_active_config_when_none_exists(project_with_source_file):
    project, sf, run, doc = project_with_source_file
    assert ProjectConfig.objects.filter(project=project).count() == 0

    promote_claim(_make_claim(sf, run, doc))

    cfgs = ProjectConfig.objects.filter(project=project)
    assert cfgs.count() == 1
    assert cfgs.first().is_active is True


def test_promote_dry_run_does_not_persist(project_with_source_file):
    project, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)

    result = promote_claim(claim, dry_run=True)
    assert result["dry_run"] is True
    assert result["would_set_status"] == "promoted"
    assert "rule_entry" in result and "next_config" in result

    claim.refresh_from_db()
    assert claim.status == "unresolved"
    assert claim.promoted_to_config is None
    # No ProjectConfig spun up either — dry-run is fully read-only.
    assert ProjectConfig.objects.filter(project=project).count() == 0


def test_promote_appends_when_config_already_has_other_rules(project_with_source_file):
    project, sf, run, doc = project_with_source_file
    cfg = ProjectConfig.objects.create(
        project=project, version=1, is_active=True,
        config={CLAIM_DERIVED_RULES_SECTION: [{"_claim_id": "preexisting"}]},
    )

    promote_claim(_make_claim(sf, run, doc))

    cfg.refresh_from_db()
    rules = cfg.config[CLAIM_DERIVED_RULES_SECTION]
    assert len(rules) == 2
    assert rules[0]["_claim_id"] == "preexisting"
    # Newest entry was appended at the end so order = chronological.
    assert rules[-1]["predicate"] == "fire_resistance_class"


def test_promote_rejects_already_promoted_claim(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)
    promote_claim(claim)

    with pytest.raises(ClaimStateError):
        promote_claim(claim)


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------


def test_reject_records_reason(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)

    result = reject_claim(claim, reason="Out of project scope")
    assert result["status"] == "rejected"
    claim.refresh_from_db()
    assert claim.status == "rejected"
    assert claim.rejected_reason == "Out of project scope"
    assert claim.decided_at is not None


def test_reject_requires_non_empty_reason(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)
    with pytest.raises(ClaimStateError):
        reject_claim(claim, reason="   ")


def test_reject_dry_run_does_not_persist(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)
    reject_claim(claim, reason="duplicate", dry_run=True)
    claim.refresh_from_db()
    assert claim.status == "unresolved"
    assert claim.rejected_reason == ""


# ---------------------------------------------------------------------------
# Supersede
# ---------------------------------------------------------------------------


def test_supersede_links_old_claim_to_newer(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    older = _make_claim(sf, run, doc, value="REI60")
    newer = _make_claim(sf, run, doc, value="REI90")

    result = supersede_claim(older, superseded_by=newer)
    assert result["status"] == "superseded"

    older.refresh_from_db()
    assert older.status == "superseded"
    assert older.superseded_by_id == newer.id


def test_supersede_rejects_self_reference(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    claim = _make_claim(sf, run, doc)
    with pytest.raises(ClaimStateError):
        supersede_claim(claim, superseded_by=claim)


def test_supersede_rejects_cross_project(project_with_source_file, db):
    _, sf1, run1, doc1 = project_with_source_file
    older = _make_claim(sf1, run1, doc1)

    other_project = Project.objects.create(name="other", description="pytest")
    sf2 = SourceFile.objects.create(
        project=other_project,
        original_filename="other.pdf",
        format="pdf",
        file_size=1,
        checksum_sha256="1" * 64,
    )
    run2 = ExtractionRun.objects.create(source_file=sf2, status="completed")
    newer = _make_claim(sf2, run2, doc=None)

    with pytest.raises(ClaimStateError):
        supersede_claim(older, superseded_by=newer)


# ---------------------------------------------------------------------------
# Conflicts
# ---------------------------------------------------------------------------


def test_find_conflicts_same_predicate_subject_different_value(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    a = _make_claim(sf, run, doc, value="REI60")
    b = _make_claim(sf, run, doc, value="REI90", statement="Walls shall be REI90.")
    c = _make_claim(sf, run, doc, value="REI60", statement="Walls shall be REI60 again.")

    rivals = find_conflicts(a)
    assert {r.id for r in rivals} == {b.id}
    # Same value -> not a conflict
    assert c not in rivals


def test_find_conflicts_skips_when_subject_or_predicate_missing(project_with_source_file):
    _, sf, run, doc = project_with_source_file
    a = Claim.objects.create(
        source_file=sf,
        document=doc,
        extraction_run=run,
        statement="No subject claim",
        normalized={},
        claim_type="rule",
        confidence=0.5,
    )
    assert find_conflicts(a) == []
