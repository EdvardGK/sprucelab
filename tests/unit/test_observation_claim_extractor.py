"""
Observation → Claim extractor (Layer-1 → Layer-2 derivation).

Covers:
  - Pattern catalogue: elevation labels, NS3451 codes, grid labels emit
    claims with the right ``predicate`` / ``value`` / ``units`` / ``confidence``.
  - Observations whose content matches no pattern are skipped (no claim).
  - Idempotency: running the extractor twice over the same observation set
    creates each claim exactly once.
  - The ``origin_observation`` FK is populated and queryable.
  - ``emit_for_drawing_sheet`` (the live drawing-flush path) automatically
    triggers claim extraction over its freshly-created text blocks.
  - Deleting the originating observation leaves the derived claim intact
    (SET_NULL cascade).
"""
from __future__ import annotations

import pytest

from apps.entities.models import Claim, DrawingSheet, Observation
from apps.entities.services.observation_claim_extractor import (
    extract_claims_for_observations,
)
from apps.entities.services.observation_emitter import emit_for_drawing_sheet
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project():
    return Project.objects.create(name='obs-claim-test')


@pytest.fixture
def sf(project):
    return SourceFile.objects.create(
        project=project,
        original_filename='A101.pdf',
        format='pdf',
        file_size=1,
    )


@pytest.fixture
def run(sf):
    return ExtractionRun.objects.create(source_file=sf, status='completed')


@pytest.fixture
def sheet(sf, run):
    return DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        sheet_number='A101',
        sheet_name='Plan Floor 1',
    )


def _make_text_observation(sf, run, sheet, content):
    return Observation.objects.create(
        source_file=sf,
        extraction_run=run,
        sheet=sheet,
        category='text_block',
        content=content,
        page_index=0,
    )


# ---------------------------------------------------------------------------
# Pattern catalogue
# ---------------------------------------------------------------------------


@pytest.mark.parametrize('content,expected_value', [
    ('+2.40', 2.40),
    ('-1.55', -1.55),
    ('±0.00', 0.0),
    ('+/-0.00', 0.0),
    ('3.00', 3.0),
    # Continental decimal comma
    ('+2,40', 2.40),
])
def test_elevation_labels_emit_claims(sf, run, sheet, content, expected_value):
    obs = _make_text_observation(sf, run, sheet, content)
    result = extract_claims_for_observations([obs])

    assert len(result.created_claims) == 1
    claim = result.created_claims[0]
    assert claim.normalized['predicate'] == 'elevation'
    assert claim.normalized['units'] == 'm'
    assert claim.normalized['value'] == pytest.approx(expected_value)
    assert claim.confidence == pytest.approx(0.7)
    assert claim.claim_type == 'spec'


@pytest.mark.parametrize('content', ['234', '234.1', '234.12'])
def test_ns3451_codes_emit_claims(sf, run, sheet, content):
    obs = _make_text_observation(sf, run, sheet, content)
    result = extract_claims_for_observations([obs])

    assert len(result.created_claims) == 1
    claim = result.created_claims[0]
    assert claim.normalized['predicate'] == 'ns3451_code'
    assert claim.normalized['units'] == 'code'
    assert claim.normalized['value'] == content


@pytest.mark.parametrize('content', ['A', 'B1', 'C12'])
def test_grid_labels_emit_claims(sf, run, sheet, content):
    obs = _make_text_observation(sf, run, sheet, content)
    result = extract_claims_for_observations([obs])

    assert len(result.created_claims) == 1
    claim = result.created_claims[0]
    assert claim.normalized['predicate'] == 'grid_label'
    assert claim.normalized['value'] == content


@pytest.mark.parametrize('content', [
    'GENERAL NOTES',          # plain prose, no match
    'SEE STRUCTURAL',         # plain prose, no match
    'A100-3',                 # part number, not a grid label
    '1234',                   # 4 digits, not NS3451 (must be exactly 3)
    '',                       # empty
    '   ',                    # whitespace only
    'a',                      # lowercase grid label rejected (must be A-Z)
])
def test_non_matching_text_blocks_emit_no_claims(sf, run, sheet, content):
    obs = _make_text_observation(sf, run, sheet, content)
    result = extract_claims_for_observations([obs])

    assert result.created_claims == []
    assert result.skipped_unmatched == 1


def test_non_text_block_observations_are_ignored(sf, run, sheet):
    # A 'layer' observation with content that WOULD match elevation pattern
    # should still be skipped because the extractor only consumes text_blocks.
    layer_obs = Observation.objects.create(
        source_file=sf,
        extraction_run=run,
        sheet=sheet,
        category='layer',
        key='+2.40',
        content='+2.40',
        page_index=0,
    )
    result = extract_claims_for_observations([layer_obs])

    assert result.created_claims == []
    # Skipped categories don't contribute to the unmatched counter — they're
    # filtered out before classification runs.
    assert result.skipped_unmatched == 0


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_re_running_extractor_does_not_duplicate_claims(sf, run, sheet):
    obs_a = _make_text_observation(sf, run, sheet, '+2.40')
    obs_b = _make_text_observation(sf, run, sheet, '234')

    first = extract_claims_for_observations([obs_a, obs_b])
    assert len(first.created_claims) == 2

    second = extract_claims_for_observations([obs_a, obs_b])
    assert second.created_claims == []
    assert second.skipped_existing == 2

    assert Claim.objects.filter(origin_observation__in=[obs_a, obs_b]).count() == 2


def test_idempotency_is_per_observation_not_per_signature(sf, run, sheet):
    # Two different observations with the SAME content (e.g. the elevation
    # '+2.40' appearing twice on the sheet) should produce two claims.
    # Idempotency keys on origin_observation_id, not on normalized signature.
    obs_a = _make_text_observation(sf, run, sheet, '+2.40')
    obs_b = _make_text_observation(sf, run, sheet, '+2.40')

    result = extract_claims_for_observations([obs_a, obs_b])
    assert len(result.created_claims) == 2

    # Re-running is still a no-op for both.
    rerun = extract_claims_for_observations([obs_a, obs_b])
    assert rerun.skipped_existing == 2
    assert rerun.created_claims == []


# ---------------------------------------------------------------------------
# FK + provenance
# ---------------------------------------------------------------------------


def test_origin_observation_fk_populated(sf, run, sheet):
    obs = _make_text_observation(sf, run, sheet, '+2.40')
    result = extract_claims_for_observations([obs])

    claim = result.created_claims[0]
    assert claim.origin_observation_id == obs.id

    # Reverse accessor ``Observation.derived_claims`` works.
    assert list(obs.derived_claims.all()) == [claim]


def test_provenance_copied_from_observation(sf, run, sheet):
    obs = _make_text_observation(sf, run, sheet, '+2.40')
    obs.bbox = {'x_mm': 12, 'y_mm': 34}
    obs.save(update_fields=['bbox'])

    claim = extract_claims_for_observations([obs]).created_claims[0]
    assert claim.source_file_id == sf.id
    assert claim.extraction_run_id == run.id
    assert claim.source_location['observation_id'] == str(obs.id)
    assert claim.source_location['sheet_id'] == str(sheet.id)
    assert claim.source_location['page_index'] == 0
    assert claim.source_location['bbox'] == {'x_mm': 12, 'y_mm': 34}


# ---------------------------------------------------------------------------
# Cascade on observation deletion
# ---------------------------------------------------------------------------


def test_claim_survives_observation_deletion(sf, run, sheet):
    obs = _make_text_observation(sf, run, sheet, '+2.40')
    claim = extract_claims_for_observations([obs]).created_claims[0]
    claim_id = claim.id

    obs.delete()

    # Claim is still there, but origin_observation is now NULL (SET_NULL).
    refreshed = Claim.objects.get(id=claim_id)
    assert refreshed.origin_observation_id is None
    # Statement remains so the audit trail still reads.
    assert refreshed.statement == '+2.40'
    assert refreshed.normalized['predicate'] == 'elevation'


# ---------------------------------------------------------------------------
# Wiring into the live emit path
# ---------------------------------------------------------------------------


def test_emit_for_drawing_sheet_triggers_claim_extraction(sf, run):
    sheet = DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        sheet_number='A101',
        sheet_name='Plan Floor 1',
        raw_metadata={
            'text_blocks': [
                {'text': '+2.40', 'x_mm': 10, 'y_mm': 50},     # elevation
                {'text': '234', 'x_mm': 50, 'y_mm': 50},        # ns3451
                {'text': 'A1', 'x_mm': 100, 'y_mm': 50},        # grid label
                {'text': 'GENERAL NOTES', 'x_mm': 200, 'y_mm': 50},  # no match
            ],
        },
    )

    created_obs = emit_for_drawing_sheet(
        sheet, extraction_run=run, Observation=Observation,
    )
    text_blocks = [o for o in created_obs if o.category == 'text_block']
    assert len(text_blocks) == 4

    claims = Claim.objects.filter(origin_observation__in=text_blocks)
    assert claims.count() == 3
    predicates = sorted(c.normalized['predicate'] for c in claims)
    assert predicates == ['elevation', 'grid_label', 'ns3451_code']


def test_emit_with_extract_claims_disabled_does_not_create_claims(sf, run):
    sheet = DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        raw_metadata={
            'text_blocks': [{'text': '+2.40', 'x_mm': 10, 'y_mm': 50}],
        },
    )

    created_obs = emit_for_drawing_sheet(
        sheet, extraction_run=run, Observation=Observation,
        extract_claims=False,
    )
    assert any(o.category == 'text_block' for o in created_obs)
    assert Claim.objects.filter(origin_observation__in=created_obs).count() == 0


def test_re_emitting_same_sheet_does_not_double_claims(sf, run):
    sheet = DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        raw_metadata={
            'text_blocks': [{'text': '+2.40', 'x_mm': 10, 'y_mm': 50}],
        },
    )
    first = emit_for_drawing_sheet(sheet, extraction_run=run, Observation=Observation)
    first_text = [o for o in first if o.category == 'text_block']

    # Re-running the extractor over the SAME persisted observations should
    # not duplicate claims — this is the path consumers will hit when they
    # call extract_claims_for_observations directly after a backfill.
    rerun = extract_claims_for_observations(first_text)
    assert rerun.created_claims == []
    assert rerun.skipped_existing == 1
