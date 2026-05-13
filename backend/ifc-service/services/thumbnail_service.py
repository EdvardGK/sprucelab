"""
Thumbnail generation service.

Renders a PNG snapshot of an IFC model using ifcopenshell.geom.iterator
(one multi-threaded geometry pass) and matplotlib Agg backend (no display).

Returns raw PNG bytes. If geometry is empty or an error occurs during
rendering, returns a placeholder PNG so the caller always has something
to upload.

CLAUDE.md geometry rule: ALWAYS use geom.iterator — never create_shape per
element. Iterator runs a single C++ pass; per-element calls are N roundtrips.
"""
from __future__ import annotations

import io
import logging
import traceback
from typing import Optional

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

MAX_TRIANGLES = 500_000  # sub-sample beyond this to keep memory sane


def generate_thumbnail_png(ifc_path: str, *, size: int = 512) -> bytes:
    """Render a PNG snapshot of the IFC model at *ifc_path*.

    Uses ``ifcopenshell.geom.iterator`` to walk geometry once (per the
    CLAUDE.md iterator rule), projects to an isometric view via matplotlib
    ``Poly3DCollection``, and returns raw PNG bytes via the Agg backend
    (no display required).

    Empty / failed geometry returns a placeholder PNG (solid neutral grey
    with centred text "No geometry") so the upload still succeeds and the
    frontend always has something to show.

    Args:
        ifc_path: Absolute path to a local IFC file.
        size:     Output image side length in pixels (square). Default 512.

    Returns:
        Raw PNG bytes (always non-empty).
    """
    # Set Agg backend BEFORE importing pyplot to avoid display requirements
    # on headless servers.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt  # noqa: E402  (must come after use())

    try:
        vertices_list, faces_list = _collect_geometry(ifc_path)
    except Exception as exc:
        logger.error(
            "thumbnail_geometry_failed ifc_path=%s error=%s\n%s",
            ifc_path,
            exc,
            traceback.format_exc(),
        )
        return _placeholder_png(size, label="No geometry")

    if not vertices_list:
        logger.info("thumbnail_no_geometry ifc_path=%s", ifc_path)
        return _placeholder_png(size, label="No geometry")

    try:
        return _render_png(vertices_list, faces_list, size=size)
    except Exception as exc:
        logger.error(
            "thumbnail_render_failed ifc_path=%s error=%s\n%s",
            ifc_path,
            exc,
            traceback.format_exc(),
        )
        return _placeholder_png(size, label="Render error")
    finally:
        plt.close("all")


# --------------------------------------------------------------------------- #
# Geometry collection
# --------------------------------------------------------------------------- #

def _collect_geometry(ifc_path: str):
    """Walk the IFC geometry with geom.iterator and collect mesh data.

    Returns (vertices_list, faces_list) where each entry corresponds to one
    product. Both lists are parallel — element i in vertices_list matches
    element i in faces_list.

    Raises on hard IO / parse failures so the caller can fall back to the
    placeholder.
    """
    import ifcopenshell
    import ifcopenshell.geom
    import numpy as np

    ifc_file = ifcopenshell.open(ifc_path)

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    iterator = ifcopenshell.geom.iterator(settings, ifc_file, multiprocessing=True)

    vertices_list: list[np.ndarray] = []
    faces_list: list[np.ndarray] = []
    total_triangles = 0

    if not iterator.initialize():
        return vertices_list, faces_list

    while True:
        shape = iterator.get()
        geom = shape.geometry

        # Flat arrays: verts = [x0,y0,z0, x1,y1,z1, ...], faces = [i0,i1,i2, ...]
        verts = np.array(geom.verts).reshape(-1, 3)
        faces = np.array(geom.faces).reshape(-1, 3)

        if verts.shape[0] == 0 or faces.shape[0] == 0:
            if not iterator.next():
                break
            continue

        vertices_list.append(verts)
        faces_list.append(faces)
        total_triangles += len(faces)

        # Sub-sample when the model is very large: stop collecting new shapes
        # once we hit the triangle cap. This means large buildings get a partial
        # but correct thumbnail rather than running out of memory.
        if total_triangles >= MAX_TRIANGLES:
            logger.info(
                "thumbnail_subsample ifc_path=%s triangles_collected=%d cap=%d",
                ifc_path,
                total_triangles,
                MAX_TRIANGLES,
            )
            break

        if not iterator.next():
            break

    return vertices_list, faces_list


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

def _render_png(
    vertices_list: list,
    faces_list: list,
    *,
    size: int = 512,
) -> bytes:
    """Render collected mesh data as a PNG and return raw bytes."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    import numpy as np

    # Build the triangle soup from all shapes
    polys: list[np.ndarray] = []
    all_verts: list[np.ndarray] = []
    for verts, faces in zip(vertices_list, faces_list):
        all_verts.append(verts)
        for tri in faces:
            polys.append(verts[tri])

    # Auto-fit bounding box
    combined = np.vstack(all_verts)
    mins = combined.min(axis=0)
    maxs = combined.max(axis=0)
    centre = (mins + maxs) / 2.0
    extents = (maxs - mins)
    max_extent = float(extents.max()) or 1.0

    # Inch size so DPI * inches == pixel size
    inches = size / 100.0
    dpi = 100

    fig = plt.figure(figsize=(inches, inches), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")

    collection = Poly3DCollection(
        polys,
        facecolor="#d0cfc8",   # neutral warm grey
        edgecolor="#8a8880",   # slightly darker edge for wireframe feel
        linewidth=0.15,
        alpha=0.92,
    )
    ax.add_collection3d(collection)

    # Set axis limits centred on bounding box
    half = max_extent * 0.6
    ax.set_xlim(centre[0] - half, centre[0] + half)
    ax.set_ylim(centre[1] - half, centre[1] + half)
    ax.set_zlim(centre[2] - half, centre[2] + half)

    # Isometric-ish camera
    ax.view_init(elev=20, azim=30)

    # Clean image: remove axes, ticks, gridlines, panes
    ax.set_axis_off()
    ax.xaxis.pane.fill = False
    ax.yaxis.pane.fill = False
    ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor("none")
    ax.yaxis.pane.set_edgecolor("none")
    ax.zaxis.pane.set_edgecolor("none")
    ax.grid(False)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_zticks([])

    fig.patch.set_facecolor("white")
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    buf = io.BytesIO()
    fig.savefig(
        buf,
        format="png",
        dpi=dpi,
        bbox_inches="tight",
        pad_inches=0.02,
        facecolor="white",
    )
    buf.seek(0)
    return buf.read()


# --------------------------------------------------------------------------- #
# Placeholder
# --------------------------------------------------------------------------- #

def _placeholder_png(size: int, label: str = "No geometry") -> bytes:
    """Return a neutral-grey PNG with centred text."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    inches = size / 100.0
    dpi = 100
    fig, ax = plt.subplots(figsize=(inches, inches), dpi=dpi)
    fig.patch.set_facecolor("#c8c8c8")
    ax.set_facecolor("#c8c8c8")
    ax.text(
        0.5, 0.5, label,
        ha="center", va="center",
        transform=ax.transAxes,
        fontsize=max(8, size // 40),
        color="#606060",
    )
    ax.set_axis_off()
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", pad_inches=0)
    buf.seek(0)
    data = buf.read()
    plt.close(fig)
    return data
