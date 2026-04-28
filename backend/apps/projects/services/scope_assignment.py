"""ProjectScope membership logic.

Two assignment paths exist on the roadmap:

1. **Manual** — the API caller passes a list of ``SourceFile`` ids and the scope
   they belong to. Implemented here by ``assign_files_to_scope``. Cross-project
   ids are rejected to keep scope membership consistent with project ownership.

2. **Auto** — derive scope membership from spatial data (storey footprint
   polygon containment + axis-grid bounds). Stub only. IfcGrid extraction
   shipped in Phase 4 (``ExtractionRun.discovered_grid``); the remaining
   blocker is per-scope footprint authoring (UI + ``ProjectScope.footprint_polygon``
   capture), which is a separate slice.
"""
from __future__ import annotations

from typing import Iterable

from django.core.exceptions import ValidationError

from apps.models.models import SourceFile

from ..models import ProjectScope


def assign_files_to_scope(
    scope: ProjectScope, source_file_ids: Iterable[str]
) -> int:
    """Assign the given SourceFiles to ``scope``. Returns the updated row count.

    Raises ``ValidationError`` if any id resolves to a file in a different
    project — scope membership cannot cross project boundaries.
    """
    ids = list(source_file_ids)
    if not ids:
        return 0

    files = SourceFile.objects.filter(id__in=ids)
    found_ids = set(str(f.id) for f in files)
    missing = set(str(i) for i in ids) - found_ids
    if missing:
        raise ValidationError(
            {'source_file_ids': f"Unknown SourceFile ids: {sorted(missing)}"}
        )

    cross_project = files.exclude(project_id=scope.project_id)
    if cross_project.exists():
        bad = list(cross_project.values_list('id', flat=True))
        raise ValidationError({
            'source_file_ids': (
                f"Files do not belong to scope.project ({scope.project_id}): "
                f"{[str(i) for i in bad]}"
            )
        })

    return files.update(scope=scope)


def auto_assign_by_footprint(scope: ProjectScope) -> int:
    """Auto-assign storeys/files to a scope by footprint-polygon containment.

    Phase 4 work — depends on IfcGrid extraction landing first. Tracked in
    ``docs/plans/2026-04-26-data-foundation-plan.md``.
    """
    raise NotImplementedError(
        "Footprint-polygon auto-assignment lands in Phase 4 (IfcGrid extraction)."
    )
