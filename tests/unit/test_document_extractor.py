"""
Unit tests for the FastAPI document extractor (Phase 6, Sprint 6.1).

Mirrors the structure of ``test_drawing_extractor.py``: each format gets
focused tests for the markdown / structured-data shape, plus error paths.
No Django DB — the extractor is a pure function over a file path.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from services.document_extractor import (
    _looks_like_document_page,
    _normalize_search_text,
    _infer_column_types,
    extract_document,
)
from tests.fixtures.document_factory import (
    build_docx_with_headings,
    build_pdf_multipage_doc_and_drawing,
    build_pdf_text_document,
    build_pptx_with_slides,
    build_xlsx_with_typed_data,
)


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def test_pdf_text_document_extracts_markdown(tmp_path: Path):
    fp = build_pdf_text_document(tmp_path / "spec.pdf")
    result = extract_document(str(fp), "pdf")

    assert result.success is True
    assert result.format == "pdf"
    assert len(result.documents) == 1
    doc = result.documents[0]
    assert doc.is_document is True
    assert doc.extraction_method == "text_layer"
    assert doc.page_count == 1
    assert "Spesifikasjon REI60" in doc.markdown_content
    # search_text is lowercased + whitespace-normalized for predictable matches.
    assert "rei60" in doc.search_text
    # Heading detection: at least one ## or ### should appear.
    assert "## " in doc.markdown_content or "### " in doc.markdown_content
    qr = result.quality_report
    assert qr["document_pages"] == 1
    assert qr["drawing_pages"] == 0
    assert qr["total_chars"] > 1000


def test_pdf_mixed_pages_split_by_classifier(tmp_path: Path):
    fp = build_pdf_multipage_doc_and_drawing(tmp_path / "mixed.pdf")
    result = extract_document(str(fp), "pdf")

    assert result.success is True
    flags = [d.is_document for d in result.documents]
    assert flags == [True, False], (
        "Page 0 should be classified as a document, page 1 as a drawing"
    )
    # The drawing page emits an empty payload — markdown should be blank.
    assert result.documents[1].markdown_content == ""
    assert result.documents[0].markdown_content
    qr = result.quality_report
    assert qr["document_count"] == 2
    assert qr["document_pages"] == 1
    assert qr["drawing_pages"] == 1


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------


def test_docx_emits_headings_lists_and_table(tmp_path: Path):
    fp = build_docx_with_headings(tmp_path / "spec.docx")
    result = extract_document(str(fp), "docx")

    assert result.success is True
    assert len(result.documents) == 1
    doc = result.documents[0]
    md = doc.markdown_content

    # Heading 1 -> '# ', Heading 2 -> '## '
    assert "# Project Specification" in md
    assert "## Fire Resistance" in md
    assert "## Materials" in md
    # Bulleted list items
    assert "- Concrete" in md
    assert "- Steel" in md
    # Table rendered as markdown
    assert "| Element | Class | Notes |" in md
    assert "| Wall | REI60 |" in md

    # structure metadata captures heading hierarchy and table count
    headings = doc.structure.get("headings") or []
    assert {h["level"] for h in headings} == {1, 2}
    tables = doc.structure.get("tables") or []
    assert len(tables) == 1
    assert tables[0]["row_count"] == 3
    assert tables[0]["col_count"] == 3


# ---------------------------------------------------------------------------
# XLSX
# ---------------------------------------------------------------------------


def test_xlsx_preserves_types_per_sheet(tmp_path: Path):
    fp = build_xlsx_with_typed_data(tmp_path / "q.xlsx")
    result = extract_document(str(fp), "xlsx")

    assert result.success is True
    doc = result.documents[0]
    sheets = doc.structured_data["sheets"]
    by_name = {s["name"]: s for s in sheets}

    quantities = by_name["Quantities"]
    assert quantities["columns"] == ["Element", "Count", "Area_m2", "Approved"]
    # Per-column types: string, number, number, boolean
    assert quantities["types"] == ["string", "number", "number", "boolean"]
    # First data row: numbers stay numbers
    first = quantities["rows"][0]
    assert first[0] == "Wall"
    assert first[1] == 42
    assert first[2] == 350.5
    assert first[3] is True

    schedule = by_name["Schedule"]
    # Date columns serialize as ISO strings, type tagged as 'date'.
    # openpyxl reads dates back as datetime objects (midnight time), so the
    # ISO form includes the zero time component.
    assert schedule["types"] == ["string", "date", "date"]
    assert schedule["rows"][0][1].startswith("2026-05-01")
    assert schedule["rows"][0][2].startswith("2026-06-15")

    # Search text covers headers + body so the universal search endpoint can
    # match terms like 'Foundation' or 'Wall'.
    assert "wall" in doc.search_text
    assert "foundation" in doc.search_text


# ---------------------------------------------------------------------------
# PPTX
# ---------------------------------------------------------------------------


def test_pptx_emits_one_section_per_slide(tmp_path: Path):
    fp = build_pptx_with_slides(tmp_path / "deck.pptx")
    result = extract_document(str(fp), "pptx")

    assert result.success is True
    doc = result.documents[0]
    md = doc.markdown_content

    # Each slide title becomes an H2 section.
    assert "## Project Brief" in md
    assert "## Brannkrav" in md
    assert "## Schedule" in md
    # Slide bullet content shows as markdown bullets.
    assert "- Goal: deliver MVP" in md
    assert "- Vegger skal vaere REI60" in md

    headings = doc.structure.get("headings") or []
    assert [h["text"] for h in headings] == [
        "Project Brief", "Brannkrav", "Schedule",
    ]
    assert doc.page_count == 3


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


def test_missing_file_returns_failure(tmp_path: Path):
    result = extract_document(str(tmp_path / "nope.pdf"), "pdf")
    assert result.success is False
    assert "not found" in (result.error or "").lower()
    assert result.documents == []


def test_unsupported_format_returns_failure(tmp_path: Path):
    fp = tmp_path / "blob.bin"
    fp.write_bytes(b"\x00\x01\x02")
    result = extract_document(str(fp), "bin")
    assert result.success is False
    assert "unsupported" in (result.error or "").lower()


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_looks_like_document_page_thresholds():
    # A4 portrait, dense text -> document
    assert _looks_like_document_page(210.0, 297.0, 0.1) is True
    # A4 portrait but sparse -> not a document (drawing-classified)
    assert _looks_like_document_page(210.0, 297.0, 0.01) is False
    # A3 landscape -> too big to be A4-or-smaller -> drawing
    assert _looks_like_document_page(420.0, 297.0, 0.1) is False
    # Square page -> aspect outside 1.2..1.6 -> not a document
    assert _looks_like_document_page(200.0, 200.0, 0.1) is False


def test_normalize_search_text_collapses_and_lowercases():
    assert _normalize_search_text("  Hello\n  WORLD  ") == "hello world"
    assert _normalize_search_text("") == ""
    assert _normalize_search_text("\t\nA\tB\n") == "a b"


def test_infer_column_types_handles_mixed_and_empty():
    body = [
        ["a", 1, None],
        ["b", 2, None],
        ["c", "x", None],  # column 1 is mixed (number + string)
    ]
    types = _infer_column_types(body, 3)
    assert types == ["string", "mixed", "empty"]
