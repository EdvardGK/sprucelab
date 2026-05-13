"""
Unit tests for ``services.thumbnail_service``.

These tests are purely functional — they do not touch Django or the database.
They run in the sprucelab conda env where ifcopenshell and matplotlib are
available.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from services.thumbnail_service import generate_thumbnail_png

# PNG magic bytes: first 8 bytes of every valid PNG file.
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def minimal_ifc_path(tmp_path_factory):
    """Build a tiny IFC4 with one wall and write it to a temp file."""
    from tests.fixtures.ifc_factory import build_minimal_ifc
    out = tmp_path_factory.mktemp("ifc") / "test_model.ifc"
    build_minimal_ifc(out)
    return str(out)


@pytest.fixture(scope="module")
def no_geometry_ifc_path(tmp_path_factory):
    """Build an IFC4 file that contains NO geometry (just the project header)."""
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcProject", name="Empty Project"
    )
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})

    out = tmp_path_factory.mktemp("ifc") / "no_geometry.ifc"
    f.write(str(out))
    return str(out)


# ---------------------------------------------------------------------------
# Tests: normal IFC with geometry
# ---------------------------------------------------------------------------

class TestGenerateThumbnailPng:
    def test_returns_bytes(self, minimal_ifc_path):
        result = generate_thumbnail_png(minimal_ifc_path)
        assert isinstance(result, bytes), "Should return bytes"

    def test_png_magic(self, minimal_ifc_path):
        result = generate_thumbnail_png(minimal_ifc_path)
        assert result[:8] == PNG_MAGIC, (
            f"Expected PNG magic bytes, got {result[:8]!r}"
        )

    def test_minimum_size(self, minimal_ifc_path):
        result = generate_thumbnail_png(minimal_ifc_path)
        assert len(result) > 1024, (
            f"PNG too small ({len(result)} bytes) — likely empty/broken"
        )

    def test_maximum_size(self, minimal_ifc_path):
        result = generate_thumbnail_png(minimal_ifc_path)
        max_bytes = 500 * 1024  # 500 KB
        assert len(result) < max_bytes, (
            f"PNG too large ({len(result)} bytes) for a 512×512 thumbnail"
        )

    def test_custom_size(self, minimal_ifc_path):
        """size= kwarg is accepted and produces a valid PNG."""
        result = generate_thumbnail_png(minimal_ifc_path, size=256)
        assert result[:8] == PNG_MAGIC
        assert len(result) > 1024


# ---------------------------------------------------------------------------
# Tests: IFC with no renderable geometry
# ---------------------------------------------------------------------------

class TestNoGeometryPlaceholder:
    def test_returns_bytes_not_raises(self, no_geometry_ifc_path):
        """generate_thumbnail_png must never raise, even on empty geometry."""
        result = generate_thumbnail_png(no_geometry_ifc_path)
        assert isinstance(result, bytes)

    def test_placeholder_is_valid_png(self, no_geometry_ifc_path):
        result = generate_thumbnail_png(no_geometry_ifc_path)
        assert result[:8] == PNG_MAGIC, (
            f"Placeholder should be a valid PNG, got {result[:8]!r}"
        )

    def test_placeholder_min_size(self, no_geometry_ifc_path):
        result = generate_thumbnail_png(no_geometry_ifc_path)
        assert len(result) > 512, (
            f"Placeholder too small ({len(result)} bytes)"
        )


# ---------------------------------------------------------------------------
# Tests: bad input (non-existent path)
# ---------------------------------------------------------------------------

class TestInvalidInput:
    def test_nonexistent_file_returns_placeholder(self):
        """A path that does not exist should not raise — return placeholder."""
        result = generate_thumbnail_png("/tmp/this_file_absolutely_does_not_exist.ifc")
        assert result[:8] == PNG_MAGIC, "Should return a valid PNG placeholder"
        assert len(result) > 512
