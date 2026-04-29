"""
Phase 5 — drawing API surface (Django REST).

Covers the DrawingSheetViewSet listing/filter and the `register` action that
solves the affine transform from grid intersections in
ExtractionRun.discovered_grid.
"""
from __future__ import annotations

import pytest

from apps.entities.models import DrawingSheet, TitleBlockTemplate
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project


@pytest.fixture
def project(db):
    return Project.objects.create(name="ph5-api")


@pytest.fixture
def pdf_source_file(project):
    return SourceFile.objects.create(
        project=project,
        original_filename="A101.pdf",
        format="pdf",
        file_size=1,
    )


@pytest.fixture
def pdf_extraction_run(pdf_source_file):
    return ExtractionRun.objects.create(source_file=pdf_source_file, status="completed")


@pytest.fixture
def pdf_sheet(pdf_source_file, pdf_extraction_run):
    return DrawingSheet.objects.create(
        source_file=pdf_source_file,
        extraction_run=pdf_extraction_run,
        page_index=0,
        sheet_number="A101",
        sheet_name="Plan Floor 1",
        width_mm=841.0,
        height_mm=594.0,
        raw_metadata={"is_drawing": True},
    )


@pytest.fixture
def ifc_source_file_with_grid(project):
    sf = SourceFile.objects.create(
        project=project, original_filename="model.ifc", format="ifc", file_size=1,
    )
    return sf


@pytest.fixture
def ifc_run_with_grid(ifc_source_file_with_grid):
    return ExtractionRun.objects.create(
        source_file=ifc_source_file_with_grid,
        status="completed",
        discovered_grid={
            "grids": [
                {
                    "name": "MainGrid",
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
        },
    )


@pytest.mark.django_db
def test_drawings_filter_by_project(client, pdf_sheet, project):
    resp = client.get(f"/api/types/drawings/?project={project.id}")
    assert resp.status_code == 200
    payload = resp.json()
    rows = payload['results'] if isinstance(payload, dict) and 'results' in payload else payload
    assert [r['sheet_number'] for r in rows] == ["A101"]


@pytest.mark.django_db
def test_drawings_filter_by_is_drawing_flag(client, pdf_source_file, pdf_extraction_run, project):
    DrawingSheet.objects.create(
        source_file=pdf_source_file, extraction_run=pdf_extraction_run, page_index=0,
        raw_metadata={"is_drawing": True},
    )
    DrawingSheet.objects.create(
        source_file=pdf_source_file, extraction_run=pdf_extraction_run, page_index=1,
        raw_metadata={"is_drawing": False},
    )

    drawings = client.get(f"/api/types/drawings/?project={project.id}&is_drawing=true").json()
    docs = client.get(f"/api/types/drawings/?project={project.id}&is_drawing=false").json()

    drawings_rows = drawings['results'] if isinstance(drawings, dict) and 'results' in drawings else drawings
    docs_rows = docs['results'] if isinstance(docs, dict) and 'results' in docs else docs
    assert len(drawings_rows) == 1
    assert len(docs_rows) == 1


@pytest.mark.django_db
def test_register_computes_transform_and_persists(client, pdf_sheet, ifc_run_with_grid):
    body = {
        "ref1": {"paper_x": 50.0, "paper_y": 50.0, "grid_u": "A", "grid_v": "1"},
        "ref2": {"paper_x": 250.0, "paper_y": 175.0, "grid_u": "B", "grid_v": "3"},
        "grid_source_run": str(ifc_run_with_grid.id),
    }
    resp = client.post(
        f"/api/types/drawings/{pdf_sheet.id}/register/",
        data=body,
        content_type="application/json",
    )
    assert resp.status_code == 201, resp.content
    payload = resp.json()
    matrix = payload['transform_matrix']
    assert len(matrix) == 3 and len(matrix[0]) == 3

    # Reload, verify persistence and that the matrix maps paper -> grid intersections.
    pdf_sheet.refresh_from_db()
    reg = pdf_sheet.registration
    a = reg.transform_matrix[0][0]
    b = reg.transform_matrix[1][0]
    tx = reg.transform_matrix[0][2]
    ty = reg.transform_matrix[1][2]
    # Transform paper (50, 50) -> model (0, 0):
    assert pytest.approx(a * 50 + reg.transform_matrix[0][1] * 50 + tx) == 0.0
    assert pytest.approx(b * 50 + reg.transform_matrix[1][1] * 50 + ty) == 0.0


@pytest.mark.django_db
def test_register_rejects_unknown_grid_tag(client, pdf_sheet, ifc_run_with_grid):
    body = {
        "ref1": {"paper_x": 50.0, "paper_y": 50.0, "grid_u": "A", "grid_v": "1"},
        "ref2": {"paper_x": 250.0, "paper_y": 175.0, "grid_u": "Z", "grid_v": "9"},
        "grid_source_run": str(ifc_run_with_grid.id),
    }
    resp = client.post(
        f"/api/types/drawings/{pdf_sheet.id}/register/",
        data=body,
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "discovered_grid" in resp.json()['error']


@pytest.mark.django_db
def test_register_rejects_coincident_paper_points(client, pdf_sheet, ifc_run_with_grid):
    body = {
        "ref1": {"paper_x": 100.0, "paper_y": 100.0, "grid_u": "A", "grid_v": "1"},
        "ref2": {"paper_x": 100.0, "paper_y": 100.0, "grid_u": "B", "grid_v": "3"},
        "grid_source_run": str(ifc_run_with_grid.id),
    }
    resp = client.post(
        f"/api/types/drawings/{pdf_sheet.id}/register/",
        data=body,
        content_type="application/json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_register_replaces_prior_registration(client, pdf_sheet, ifc_run_with_grid):
    """Calling register twice updates rather than 500ing on the OneToOne."""
    body1 = {
        "ref1": {"paper_x": 50.0, "paper_y": 50.0, "grid_u": "A", "grid_v": "1"},
        "ref2": {"paper_x": 250.0, "paper_y": 175.0, "grid_u": "B", "grid_v": "3"},
        "grid_source_run": str(ifc_run_with_grid.id),
    }
    r1 = client.post(
        f"/api/types/drawings/{pdf_sheet.id}/register/", data=body1, content_type="application/json",
    )
    assert r1.status_code == 201
    r2 = client.post(
        f"/api/types/drawings/{pdf_sheet.id}/register/", data=body1, content_type="application/json",
    )
    assert r2.status_code == 201


@pytest.mark.django_db
def test_title_block_template_crud(client, project):
    create = client.post(
        "/api/types/title-block-templates/",
        data={
            "project": str(project.id),
            "name": "A1 default",
            "fields": [
                {"name": "sheet_number", "region": {"x": 700, "y": 20, "w": 80, "h": 30}, "type": "text"},
            ],
        },
        content_type="application/json",
    )
    assert create.status_code == 201, create.content
    tpl_id = create.json()['id']

    listed = client.get(f"/api/types/title-block-templates/?project={project.id}")
    rows = listed.json()
    rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
    assert any(r['id'] == tpl_id for r in rows)

    delete = client.delete(f"/api/types/title-block-templates/{tpl_id}/")
    assert delete.status_code == 204
