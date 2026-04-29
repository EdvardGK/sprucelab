"""
Programmatic DXF/PDF fixtures for Phase 5 drawing-extractor tests.

Same shape as ``ifc_factory.py``: each builder takes ``out: Path``, returns
``out``, lazy-imports its dependency. Generated files live in tmp paths —
nothing is committed to the repo.

The numbers chosen here are tuned against the thresholds in
``backend/ifc-service/services/drawing_extractor.py``:

* DXF extents are offset by 1 mm so ezdxf's ``update_extents`` writes them
  to the header (a (0,0,0) extent corner reads as falsy and would be skipped).
* PDF document fixture pushes char-density well above the 0.05 chars/mm²
  cutoff in ``_looks_like_document_page`` so platform variance in pymupdf's
  text layout doesn't flake the test.
"""
from __future__ import annotations

from pathlib import Path


def build_dxf_with_text_blocks(out: Path) -> Path:
    """
    Minimal A3 DXF (mm units) with two TEXT entities and one MTEXT, on
    named layers TITLE and NOTES. Exercises the layer enumeration + text
    capture branches of ``_extract_dxf``.
    """
    import ezdxf

    doc = ezdxf.new("R2010", setup=False)
    doc.header["$INSUNITS"] = 4  # millimetres
    doc.layers.add("TITLE")
    doc.layers.add("NOTES")

    msp = doc.modelspace()
    msp.add_text(
        "Sheet A101", dxfattribs={"layer": "TITLE", "height": 3.0}
    ).set_placement((10.0, 280.0))
    msp.add_text(
        "Plan Floor 1", dxfattribs={"layer": "TITLE", "height": 3.0}
    ).set_placement((10.0, 270.0))
    msp.add_mtext(
        "Drawing notes",
        dxfattribs={"layer": "NOTES", "char_height": 2.5, "insert": (10.0, 260.0)},
    )

    # 1-mm offset so the (extmin, extmax) corners are truthy and survive
    # ezdxf.update_extents — a corner of (0,0,0) reads falsy and is skipped.
    msp.dxf.extmin = (1.0, 1.0, 0.0)
    msp.dxf.extmax = (421.0, 298.0, 0.0)
    doc.update_extents()
    doc.saveas(str(out))
    return out


def build_dxf_with_inch_units(out: Path) -> Path:
    """
    DXF with $INSUNITS = 1 (inches), extents 10 in × 5 in. The extractor
    must scale to 254 mm × 127 mm via the inch→mm factor (25.4).
    """
    import ezdxf

    doc = ezdxf.new("R2010", setup=False)
    doc.header["$INSUNITS"] = 1  # inches
    doc.layers.add("BORDER")

    msp = doc.modelspace()
    msp.add_text("INCH", dxfattribs={"layer": "BORDER", "height": 0.25}).set_placement(
        (1.0, 1.0)
    )
    msp.dxf.extmin = (1.0, 1.0, 0.0)
    msp.dxf.extmax = (11.0, 6.0, 0.0)  # 10 in wide × 5 in tall
    doc.update_extents()
    doc.saveas(str(out))
    return out


def build_pdf_a3_drawing(out: Path) -> Path:
    """
    Single A3 landscape page with one sparse text block — long side > 302 mm
    so it can never be classified as a document regardless of density.
    """
    import fitz  # pymupdf

    doc = fitz.open()
    # A3 landscape: 420 x 297 mm = 1190 x 842 PDF points (1 in = 72 pt = 25.4 mm)
    page = doc.new_page(width=1190, height=842)
    page.insert_text((400, 50), "DRAWING TITLE", fontsize=14)
    doc.save(str(out))
    doc.close()
    return out


def build_pdf_a4_document(out: Path) -> Path:
    """
    Single A4 portrait page filled with paragraphs so char-density clears
    the 0.05 chars/mm² cutoff comfortably (~0.09 chars/mm² on this body).
    Triggers ``is_drawing=False`` in ``_extract_pdf``.
    """
    import fitz

    doc = fitz.open()
    # A4 portrait: 210 x 297 mm = 595 x 842 PDF points
    page = doc.new_page(width=595, height=842)
    body = ("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ") * 100
    rect = fitz.Rect(40, 40, 555, 800)
    page.insert_textbox(rect, body.strip(), fontsize=10, lineheight=1.2)
    doc.save(str(out))
    doc.close()
    return out


def build_pdf_multipage_mixed(out: Path) -> Path:
    """
    Two-page PDF: page 0 is an A3 drawing, page 1 is an A4 document.
    Used by both the unit per-page test and the e2e upload round-trip.
    """
    import fitz

    doc = fitz.open()
    # Page 0: A3 landscape drawing.
    page0 = doc.new_page(width=1190, height=842)
    page0.insert_text((400, 50), "DRAWING TITLE", fontsize=14)
    # Page 1: A4 portrait, dense text → document.
    page1 = doc.new_page(width=595, height=842)
    body = ("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ") * 100
    rect = fitz.Rect(40, 40, 555, 800)
    page1.insert_textbox(rect, body.strip(), fontsize=10, lineheight=1.2)
    doc.save(str(out))
    doc.close()
    return out
