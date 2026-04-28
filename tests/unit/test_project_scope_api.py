"""Phase 3 — ProjectScope REST API."""
import pytest

from apps.models.models import SourceFile
from apps.projects.models import Project, ProjectScope


@pytest.fixture
def project(db):
    return Project.objects.create(name="phase3-api")


@pytest.fixture
def building(project):
    return ProjectScope.objects.create(
        project=project, name="Building A", scope_type="building"
    )


@pytest.mark.django_db
def test_list_filters_by_project(client, project, building):
    other = Project.objects.create(name="other-proj")
    ProjectScope.objects.create(project=other, name="elsewhere", scope_type="building")

    resp = client.get(f"/api/projects/scopes/?project={project.id}")
    assert resp.status_code == 200
    payload = resp.json()
    rows = payload['results'] if isinstance(payload, dict) and 'results' in payload else payload
    names = [r['name'] for r in rows]
    assert names == ["Building A"]


@pytest.mark.django_db
def test_create_scope_with_parent(client, project, building):
    resp = client.post(
        "/api/projects/scopes/",
        data={
            "project": str(project.id),
            "parent": str(building.id),
            "name": "L01",
            "scope_type": "floor",
        },
        content_type="application/json",
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body['name'] == "L01"
    assert body['parent'] == str(building.id)


@pytest.mark.django_db
def test_create_rejects_cross_project_parent(client, project, building):
    other = Project.objects.create(name="other-proj")
    resp = client.post(
        "/api/projects/scopes/",
        data={
            "project": str(other.id),
            "parent": str(building.id),
            "name": "Bad",
            "scope_type": "floor",
        },
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "parent" in resp.json()


@pytest.mark.django_db
def test_assign_files_action(client, project, building):
    f1 = SourceFile.objects.create(
        project=project, original_filename="a.ifc", format="ifc", file_size=1
    )
    f2 = SourceFile.objects.create(
        project=project, original_filename="b.ifc", format="ifc", file_size=1
    )
    resp = client.post(
        f"/api/projects/scopes/{building.id}/assign-files/",
        data={"source_file_ids": [str(f1.id), str(f2.id)]},
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()['updated'] == 2

    f1.refresh_from_db()
    f2.refresh_from_db()
    assert f1.scope_id == building.id
    assert f2.scope_id == building.id


@pytest.mark.django_db
def test_files_action_returns_scoped_only(client, project, building):
    in_scope = SourceFile.objects.create(
        project=project, original_filename="in.ifc", format="ifc", file_size=1, scope=building
    )
    SourceFile.objects.create(
        project=project, original_filename="out.ifc", format="ifc", file_size=1
    )
    resp = client.get(f"/api/projects/scopes/{building.id}/files/")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]['id'] == str(in_scope.id)


@pytest.mark.django_db
def test_tree_action(client, project, building):
    ProjectScope.objects.create(
        project=project, parent=building, name="L01", scope_type="floor"
    )
    ProjectScope.objects.create(
        project=project, parent=building, name="L02", scope_type="floor"
    )
    resp = client.get(f"/api/projects/scopes/tree/?project={project.id}")
    assert resp.status_code == 200
    roots = resp.json()
    assert len(roots) == 1
    assert roots[0]['name'] == "Building A"
    child_names = sorted(c['name'] for c in roots[0]['children'])
    assert child_names == ["L01", "L02"]


@pytest.mark.django_db
def test_tree_requires_project_param(client, project):
    resp = client.get("/api/projects/scopes/tree/")
    assert resp.status_code == 400
