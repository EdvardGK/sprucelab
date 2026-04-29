"""
Drawing registration: compute the affine transform paper-mm -> model-meters.

Given two reference points (paper coordinates + grid intersection labels) and
the U/V axes from `ExtractionRun.discovered_grid` (Phase 4), solves the unique
similarity transform that maps paper coordinates to model coordinates.

A similarity transform (uniform scale + rotation + translation) is the right
fit because drawings preserve angles and have a single scale. Two pairs of
matched points uniquely determine it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass(frozen=True)
class GridIntersection:
    """A grid intersection in model coordinates (meters)."""
    u_tag: str
    v_tag: str
    x: float
    y: float


def _axis_position(axis: Dict, dim: int) -> Optional[float]:
    """Pick the relevant model coordinate from an axis dict.

    `discovered_grid.u_axes[*]` has `start: [x, y, z] | None`. For U-axes
    (constant-V lines) the meaningful coordinate is y; for V-axes
    (constant-U lines) it's x. Curves with no `start` are skipped.
    """
    start = axis.get("start")
    if not start or len(start) <= dim:
        return None
    return float(start[dim])


def resolve_grid_intersection(
    discovered_grid: Dict,
    u_tag: str,
    v_tag: str,
) -> Optional[Tuple[float, float]]:
    """Return (x, y) of intersection (U=u_tag, V=v_tag) in model meters, or None.

    Convention: U-axes run along X (constant Y); V-axes run along X (constant... )
    no — for a typical orthogonal grid, U-axes vary in y and V-axes vary in x,
    so an intersection's X comes from the V-axis and Y comes from the U-axis.
    Non-orthogonal grids fall back to using the axis `start` points directly,
    which is correct for parallel-axis grids and a defensible best-effort
    otherwise.
    """
    grids = (discovered_grid or {}).get("grids") or []
    for grid in grids:
        u_axes = grid.get("u_axes") or []
        v_axes = grid.get("v_axes") or []
        u = next((a for a in u_axes if str(a.get("tag")) == u_tag), None)
        v = next((a for a in v_axes if str(a.get("tag")) == v_tag), None)
        if u is None or v is None:
            continue
        # X from V-axis start (V-axis varies in x), Y from U-axis start.
        x = _axis_position(v, 0)
        y = _axis_position(u, 1)
        if x is None or y is None:
            continue
        return (x, y)
    return None


def compute_similarity_transform(
    paper1: Tuple[float, float],
    model1: Tuple[float, float],
    paper2: Tuple[float, float],
    model2: Tuple[float, float],
) -> List[List[float]]:
    """
    Solve the 2D similarity transform mapping paper-mm to model coordinates.

    The transform is `m = R · s · p + t` where R is rotation, s is scale,
    t is translation. With two pairs of points it is uniquely determined.

    Returns a 3x3 row-major affine matrix:

        [[a, -b, tx],
         [b,  a, ty],
         [0,  0,  1]]

    so that `[m_x, m_y, 1].T = M · [p_x, p_y, 1].T`.

    Raises:
        ValueError: if the two paper points coincide.
    """
    p1x, p1y = paper1
    p2x, p2y = paper2
    m1x, m1y = model1
    m2x, m2y = model2

    dpx, dpy = (p2x - p1x), (p2y - p1y)
    paper_dist_sq = dpx * dpx + dpy * dpy
    if paper_dist_sq < 1e-9:
        raise ValueError("Paper reference points coincide; cannot solve transform")

    dmx, dmy = (m2x - m1x), (m2y - m1y)

    # The classic 2-point similarity solve: the complex ratio gives (a + bi).
    a = (dpx * dmx + dpy * dmy) / paper_dist_sq
    b = (dpx * dmy - dpy * dmx) / paper_dist_sq

    tx = m1x - a * p1x + b * p1y
    ty = m1y - b * p1x - a * p1y

    return [
        [a, -b, tx],
        [b, a, ty],
        [0.0, 0.0, 1.0],
    ]


def apply_transform(matrix: List[List[float]], paper: Tuple[float, float]) -> Tuple[float, float]:
    """Apply a 3x3 row-major affine matrix to a 2D paper point."""
    px, py = paper
    mx = matrix[0][0] * px + matrix[0][1] * py + matrix[0][2]
    my = matrix[1][0] * px + matrix[1][1] * py + matrix[1][2]
    return (mx, my)


def transform_scale_and_rotation(matrix: List[List[float]]) -> Tuple[float, float]:
    """Return (scale, rotation_degrees) of a similarity-transform matrix.

    Useful for verification / UI: a 1:50 paper plan over an IFC in meters
    should yield scale ≈ 0.05 (mm -> m) and rotation = 0.0 if the paper
    aligns with model axes.
    """
    a = matrix[0][0]
    b = matrix[1][0]
    scale = math.hypot(a, b)
    rotation = math.degrees(math.atan2(b, a))
    return (scale, rotation)
