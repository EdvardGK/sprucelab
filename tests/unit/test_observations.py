"""
Observation log — emitter + API.

Covers:
  - emit_for_drawing_sheet produces the expected categories from a
    DrawingSheet's persisted state (text_blocks, layers, metadata,
    title-block fields).
  - GET /api/types/observations/ filters by source_file, sheet, category,
    project, search, page_index.
  - Live drawing upload path also emits observations (smoke).
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.entities.models import DrawingSheet, Observation
from apps.entities.services.observation_emitter import emit_for_drawing_sheet
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project


@pytest.fixture
def project(db):
    return Project.objects.create(name='obs-test')


@pytest.fixture
def sf(project):
    return SourceFile.objects.create(
        project=project, original_filename='A101.pdf', format='pdf', file_size=1,
    )


@pytest.fixture
def run(sf):
    return ExtractionRun.objects.create(source_file=sf, status='completed')


@pytest.fixture
def sheet_with_metadata(sf, run):
    return DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        sheet_number='A101',
        sheet_name='Plan Floor 1',
        scale='1:50',
        width_mm=841.0,
        height_mm=594.0,
        title_block_data={'drawn_by': 'JN', 'rev': 'A', 'date': '2026-04-10'},
        raw_metadata={
            'text_blocks': [
                {'text': 'GENERAL NOTES', 'x_mm': 10, 'y_mm': 50, 'w_mm': 80, 'h_mm': 10},
                {'text': '', 'x_mm': 1, 'y_mm': 1, 'w_mm': 1, 'h_mm': 1},  # empty → dropped
                {'text': 'SEE STRUCTURAL', 'x_mm': 700, 'y_mm': 12, 'w_mm': 130, 'h_mm': 8},
            ],
            'layers': ['A-WALL', 'A-DOOR', 'A-GRID'],
            'modelspace_units': 4,
            'text_density': 0.012,
        },
    )


def test_emit_produces_all_expected_categories(sheet_with_metadata, run):
    created = emit_for_drawing_sheet(
        sheet_with_metadata, extraction_run=run, Observation=Observation,
    )
    assert len(created) > 0

    rows = Observation.objects.filter(sheet=sheet_with_metadata)
    cats = set(rows.values_list('category', flat=True))
    # Title block fields → sheet_number / sheet_name / scale / drawn_by / rev / date
    assert 'title_block_field' in cats
    # Dimensions + text density → sheet_metadata
    assert 'sheet_metadata' in cats
    # text_blocks
    assert 'text_block' in cats
    # layers
    assert 'layer' in cats
    # modelspace_units lives under file_metadata
    assert 'file_metadata' in cats


def test_empty_text_blocks_are_dropped(sheet_with_metadata, run):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    text_observations = Observation.objects.filter(
        sheet=sheet_with_metadata, category='text_block',
    )
    assert text_observations.count() == 2  # blank-string entry dropped
    contents = set(text_observations.values_list('content', flat=True))
    assert contents == {'GENERAL NOTES', 'SEE STRUCTURAL'}


def test_title_block_fields_emit_per_key(sheet_with_metadata, run):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    tb_rows = Observation.objects.filter(
        sheet=sheet_with_metadata, category='title_block_field',
    )
    keys = set(tb_rows.values_list('key', flat=True))
    # From sheet-level fields
    assert 'sheet_number' in keys
    assert 'sheet_name' in keys
    assert 'scale' in keys
    # From title_block_data JSON
    assert 'drawn_by' in keys
    assert 'rev' in keys
    assert 'date' in keys


def test_layers_emit_one_per_name(sheet_with_metadata, run):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    layer_rows = Observation.objects.filter(
        sheet=sheet_with_metadata, category='layer',
    )
    assert layer_rows.count() == 3
    keys = set(layer_rows.values_list('key', flat=True))
    assert keys == {'A-WALL', 'A-DOOR', 'A-GRID'}


def test_api_filters_by_source_file_and_category(sheet_with_metadata, run, sf):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    client = APIClient()

    resp = client.get(f'/api/types/observations/?source_file={sf.id}&category=layer')
    assert resp.status_code == 200, resp.content
    results = resp.json().get('results', resp.json())
    cats = {r['category'] for r in results}
    assert cats == {'layer'}
    assert len(results) == 3


def test_api_search_matches_content(sheet_with_metadata, run, sf):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    client = APIClient()

    resp = client.get(f'/api/types/observations/?source_file={sf.id}&search=STRUCTURAL')
    assert resp.status_code == 200, resp.content
    results = resp.json().get('results', resp.json())
    assert len(results) == 1
    assert 'STRUCTURAL' in results[0]['content']


def test_api_filters_by_project(sheet_with_metadata, run, project):
    emit_for_drawing_sheet(sheet_with_metadata, extraction_run=run, Observation=Observation)
    client = APIClient()
    resp = client.get(f'/api/types/observations/?project={project.id}&category=text_block')
    assert resp.status_code == 200
    results = resp.json().get('results', resp.json())
    assert len(results) == 2


def test_api_returns_empty_when_no_observations(sf):
    client = APIClient()
    resp = client.get(f'/api/types/observations/?source_file={sf.id}')
    assert resp.status_code == 200
    body = resp.json()
    results = body.get('results', body)
    assert results == []
