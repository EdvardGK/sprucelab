"""
DXF MTEXT format-code decoding.

Two layers:
  - The extractor uses ezdxf.tools.text.plain_mtext() to strip format codes
    at extraction time (going forward).
  - The `decode_dxf_text_observations` management command cleans up rows
    that were extracted before the fix.

These tests cover the decoder + the command, not the FastAPI service end
to end (that's the live drawing-upload path).
"""
from __future__ import annotations

import io

import pytest
from django.core.management import call_command

from apps.entities.models import DrawingSheet, Observation
from apps.entities.services.observation_emitter import emit_for_drawing_sheet
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project


# Sample MTEXT source strings — same shape we saw in production.
MTEXT_SAMPLES = [
    (r'\A1;{\pql;\fArial|b0|i0|c0|p0;\W1.000000;135}', '135'),
    (r'\A1;{\pql;\fArial|b0|i0|c0|p0;\W1.000000;160}', '160'),
    (r'\A1;{\fArial|b0|i0|c0|p0;Sheet A101}', 'Sheet A101'),
    ('Plain text — no format codes', 'Plain text — no format codes'),
    ('', ''),
]


@pytest.mark.parametrize('raw,expected', MTEXT_SAMPLES)
def test_plain_mtext_decodes_format_codes(raw, expected):
    """Sanity check ezdxf's helper actually does what we expect."""
    from ezdxf.tools.text import plain_mtext
    assert plain_mtext(raw, split=False) == expected


@pytest.fixture
def project(db):
    return Project.objects.create(name='mtext-decode-test')


@pytest.fixture
def sheet_with_raw_mtext(project):
    sf = SourceFile.objects.create(
        project=project, original_filename='dxf-with-mtext.dxf', format='dxf', file_size=1,
    )
    run = ExtractionRun.objects.create(source_file=sf, status='completed')
    sheet = DrawingSheet.objects.create(
        source_file=sf,
        extraction_run=run,
        page_index=0,
        raw_metadata={
            # Mimic the BUGGY extractor output: raw MTEXT source strings.
            'text_blocks': [
                {'text': raw, 'x_mm': 1, 'y_mm': 1, 'w_mm': 10, 'h_mm': 10}
                for raw, _ in MTEXT_SAMPLES if raw  # drop the empty-string row
            ],
            'layers': ['A-WALL'],
        },
    )
    emit_for_drawing_sheet(sheet, extraction_run=run, Observation=Observation)
    return sheet


def test_command_dry_run_reports_changes_but_does_not_persist(sheet_with_raw_mtext):
    out = io.StringIO()
    call_command('decode_dxf_text_observations', stdout=out)
    output = out.getvalue()
    assert 'Found' in output
    assert 'Dry-run only' in output

    # 3 MTEXT-shaped rows + 1 plain-text row → 3 would be decoded.
    text_rows = Observation.objects.filter(
        sheet=sheet_with_raw_mtext, category='text_block',
    )
    # No row should have changed yet.
    bug_remaining = [o for o in text_rows if '\\A1' in o.content]
    assert len(bug_remaining) >= 3


def test_command_apply_actually_decodes(sheet_with_raw_mtext):
    out = io.StringIO()
    call_command('decode_dxf_text_observations', '--apply', stdout=out)
    output = out.getvalue()
    assert 'Updated' in output

    text_rows = Observation.objects.filter(
        sheet=sheet_with_raw_mtext, category='text_block',
    )
    contents = sorted(o.content for o in text_rows)
    assert '135' in contents
    assert '160' in contents
    assert 'Sheet A101' in contents
    # Plain text passes through unchanged.
    assert 'Plain text — no format codes' in contents
    # Nothing left with raw MTEXT codes.
    assert not any('\\A1' in c for c in contents)


def test_command_is_idempotent(sheet_with_raw_mtext):
    call_command('decode_dxf_text_observations', '--apply', stdout=io.StringIO())
    out = io.StringIO()
    call_command('decode_dxf_text_observations', '--apply', stdout=out)
    output = out.getvalue()
    assert 'Nothing to do' in output
