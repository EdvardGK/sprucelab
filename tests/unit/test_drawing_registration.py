"""
Phase 5 — drawing registration math.

Pure-Python tests for the affine transform (paper-mm -> model-meters) and the
grid-intersection lookup. No Django, no DB, no external libs.
"""
from __future__ import annotations

import math

import pytest

from apps.entities.services.drawing_registration import (
    apply_transform,
    compute_similarity_transform,
    resolve_grid_intersection,
    transform_scale_and_rotation,
)


def test_identity_transform_at_1_to_1_scale():
    """paper == model (mm == mm) -> identity matrix, scale=1, rotation=0."""
    matrix = compute_similarity_transform(
        paper1=(0.0, 0.0), model1=(0.0, 0.0),
        paper2=(100.0, 0.0), model2=(100.0, 0.0),
    )
    scale, rot = transform_scale_and_rotation(matrix)
    assert scale == pytest.approx(1.0)
    assert rot == pytest.approx(0.0)
    assert apply_transform(matrix, (37.0, 12.0)) == pytest.approx((37.0, 12.0))


def test_1_to_50_scale_paper_mm_to_model_meters():
    """At 1:50 a 200mm paper distance corresponds to 10m model. Scale = 0.05 mm/m."""
    matrix = compute_similarity_transform(
        paper1=(50.0, 50.0), model1=(0.0, 0.0),
        paper2=(250.0, 50.0), model2=(10.0, 0.0),  # 200mm paper -> 10m model
    )
    scale, rot = transform_scale_and_rotation(matrix)
    assert scale == pytest.approx(0.05)
    assert rot == pytest.approx(0.0)

    # A point 200mm right and 100mm up of paper origin maps to (10, 5) in model.
    out = apply_transform(matrix, (250.0, 150.0))
    assert out == pytest.approx((10.0, 5.0))


def test_90_degree_rotation():
    """Paper +x maps to model +y under a 90° rotation."""
    matrix = compute_similarity_transform(
        paper1=(0.0, 0.0), model1=(0.0, 0.0),
        paper2=(100.0, 0.0), model2=(0.0, 100.0),
    )
    scale, rot = transform_scale_and_rotation(matrix)
    assert scale == pytest.approx(1.0)
    assert rot == pytest.approx(90.0)


def test_coincident_paper_points_raise():
    with pytest.raises(ValueError):
        compute_similarity_transform(
            paper1=(10.0, 10.0), model1=(0.0, 0.0),
            paper2=(10.0, 10.0), model2=(5.0, 5.0),
        )


def test_resolve_grid_intersection_basic_orthogonal_grid():
    """Discovered-grid lookup: U='B' (y=5), V='3' (x=8) -> (8, 5)."""
    grid = {
        "grids": [
            {
                "name": "MainGrid",
                "u_axes": [
                    {"tag": "A", "start": [0.0, 0.0, 0.0]},
                    {"tag": "B", "start": [0.0, 5.0, 0.0]},
                ],
                "v_axes": [
                    {"tag": "1", "start": [0.0, 0.0, 0.0]},
                    {"tag": "2", "start": [4.0, 0.0, 0.0]},
                    {"tag": "3", "start": [8.0, 0.0, 0.0]},
                ],
            }
        ]
    }
    assert resolve_grid_intersection(grid, "B", "3") == (8.0, 5.0)
    assert resolve_grid_intersection(grid, "A", "1") == (0.0, 0.0)


def test_resolve_grid_intersection_unknown_tag_returns_none():
    grid = {
        "grids": [
            {
                "u_axes": [{"tag": "A", "start": [0.0, 0.0, 0.0]}],
                "v_axes": [{"tag": "1", "start": [0.0, 0.0, 0.0]}],
            }
        ]
    }
    assert resolve_grid_intersection(grid, "Z", "1") is None
    assert resolve_grid_intersection(grid, "A", "Z") is None


def test_resolve_grid_intersection_no_grids_returns_none():
    assert resolve_grid_intersection({}, "A", "1") is None
    assert resolve_grid_intersection({"grids": []}, "A", "1") is None


def test_apply_transform_round_trip_via_resolved_grid():
    """End-to-end: take grid intersections, build transform, verify it maps correctly."""
    grid = {
        "grids": [
            {
                "u_axes": [
                    {"tag": "A", "start": [0.0, 0.0, 0.0]},
                    {"tag": "B", "start": [0.0, 5.0, 0.0]},
                ],
                "v_axes": [
                    {"tag": "1", "start": [0.0, 0.0, 0.0]},
                    {"tag": "3", "start": [8.0, 0.0, 0.0]},
                ],
            }
        ]
    }
    a1 = resolve_grid_intersection(grid, "A", "1")
    b3 = resolve_grid_intersection(grid, "B", "3")
    assert a1 == (0.0, 0.0)
    assert b3 == (8.0, 5.0)

    # User clicks A/1 at paper (50, 50) and B/3 at paper (250, 175).
    matrix = compute_similarity_transform(
        paper1=(50.0, 50.0), model1=a1,
        paper2=(250.0, 175.0), model2=b3,
    )
    # Round-trip: paper (50, 50) -> A1 = (0,0); (250, 175) -> B3 = (8, 5).
    assert apply_transform(matrix, (50.0, 50.0)) == pytest.approx((0.0, 0.0))
    assert apply_transform(matrix, (250.0, 175.0)) == pytest.approx((8.0, 5.0))
