"""Phase 3 — ProjectScope model invariants."""
import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.models.models import SourceFile
from apps.projects.models import Project, ProjectScope
from apps.projects.services.scope_assignment import (
    assign_files_to_scope,
    auto_assign_by_footprint,
)


@pytest.fixture
def project(db):
    return Project.objects.create(name="phase3", description="scope tests")


@pytest.mark.django_db
def test_create_scope_with_parent(project):
    building = ProjectScope.objects.create(
        project=project, name="Building A", scope_type="building"
    )
    floor = ProjectScope.objects.create(
        project=project, parent=building, name="L01", scope_type="floor"
    )
    assert floor.parent == building
    assert list(building.children.all()) == [floor]


@pytest.mark.django_db
def test_unique_together_project_parent_name(project):
    ProjectScope.objects.create(project=project, name="Bldg A", scope_type="building")
    with pytest.raises(IntegrityError), transaction.atomic():
        ProjectScope.objects.create(
            project=project, name="Bldg A", scope_type="building"
        )


@pytest.mark.django_db
def test_set_null_on_scope_delete(project):
    scope = ProjectScope.objects.create(project=project, name="Wing X", scope_type="wing")
    sf = SourceFile.objects.create(
        project=project,
        original_filename="x.ifc",
        format="ifc",
        file_size=1,
        scope=scope,
    )
    assert sf.scope_id == scope.id
    scope.delete()
    sf.refresh_from_db()
    assert sf.scope_id is None
    # SourceFile itself must survive
    assert SourceFile.objects.filter(id=sf.id).exists()


@pytest.mark.django_db
def test_assign_files_to_scope_happy_path(project):
    scope = ProjectScope.objects.create(project=project, name="B", scope_type="building")
    files = [
        SourceFile.objects.create(
            project=project, original_filename=f"f{i}.ifc", format="ifc", file_size=1
        )
        for i in range(3)
    ]
    updated = assign_files_to_scope(scope, [str(f.id) for f in files])
    assert updated == 3
    for f in files:
        f.refresh_from_db()
        assert f.scope_id == scope.id


@pytest.mark.django_db
def test_assign_files_rejects_cross_project(project):
    other = Project.objects.create(name="other")
    scope = ProjectScope.objects.create(project=project, name="B", scope_type="building")
    foreign_file = SourceFile.objects.create(
        project=other, original_filename="oops.ifc", format="ifc", file_size=1
    )
    with pytest.raises(ValidationError):
        assign_files_to_scope(scope, [str(foreign_file.id)])
    foreign_file.refresh_from_db()
    assert foreign_file.scope_id is None


@pytest.mark.django_db
def test_auto_assign_stub_raises(project):
    scope = ProjectScope.objects.create(project=project, name="B", scope_type="building")
    with pytest.raises(NotImplementedError):
        auto_assign_by_footprint(scope)
