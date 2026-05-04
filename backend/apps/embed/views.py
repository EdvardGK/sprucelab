"""
Forward-deployed embed: semantic-to-concrete filter resolver.

Turns a semantic filter context ({ifc_class: "IfcWall", floor_code: "03"})
into the type-level data the embed viewer and tiles need. Per-instance
express IDs are intentionally NOT returned: they aren't stored server-side
(see CLAUDE.md "We DON'T store individual entities"), and the viewer derives
them locally from ThatOpen fragment data.

Both endpoints are public, read-only, and stable contract. See
``/api/embed/capabilities/`` for the full filter surface.
"""
from __future__ import annotations

from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.entities.models import (
    AnalysisStorey,
    AnalysisTypeStorey,
    IFCType,
)
from apps.projects.models import ProjectScope


EMBED_API_VERSION = '1.0'

# Truncation threshold (per edkjo Q2 from the embed plan). When the matched
# type set covers more than this many instances, the viewer should fall back
# to highlight-by-class instead of per-instance isolation. Tuned by viewer
# perf — revisit once the highlight-mode spike numbers land.
TRUNCATION_THRESHOLD_INSTANCES = 2500


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def embed_capabilities(request):
    """
    Embed filter-resolver capability manifest.

    Mirrors the shape of ``/api/capabilities/`` but scoped to the embed
    surface — what filters the resolver understands, the response envelope
    callers can rely on, and the truncation contract.
    """
    return Response({
        'api_version': EMBED_API_VERSION,
        'service': 'sprucelab-embed-resolver',
        'endpoints': {
            'instances': '/api/embed/instances/',
            'capabilities': '/api/embed/capabilities/',
        },
        'supported_filters': {
            'project_id': {
                'source': 'apps.models.Model.project_id',
                'coverage': 'full',
                'required': True,
            },
            'ifc_class': {
                'source': 'apps.entities.IFCType.ifc_type',
                'coverage': 'full',
                'required': False,
            },
            'type_id': {
                'source': 'apps.entities.IFCType.id',
                'coverage': 'full',
                'required': False,
                'accepts': 'comma-separated UUIDs',
            },
            'floor_code': {
                'source': 'apps.projects.ProjectScope.canonical_floors[].code',
                'coverage': 'requires-analysis-ingested',
                'required': False,
                'reason': (
                    'Resolves canonical floor -> AnalysisStorey.elevation '
                    '(within scope.storey_merge_tolerance_m) -> '
                    'AnalysisTypeStorey -> IFCType. Skipped silently when '
                    'the canonical floor is unknown or no analysis rows '
                    'exist at that elevation; check skipped_filters in '
                    'the response.'
                ),
            },
        },
        'response_shape': {
            'type_ids': ['<uuid>'],
            'type_count': '<int>  # len(type_ids), pre-truncation',
            'instance_count': '<int>  # sum(IFCType.instance_count) over matched types',
            'truncated': '<bool>  # true if instance_count > threshold_instances',
            'threshold_instances': TRUNCATION_THRESHOLD_INSTANCES,
            'applied_filters': {'<filter_name>': '<value>'},
            'skipped_filters': ['<filter_name>'],
        },
        'truncation': {
            'threshold_instances': TRUNCATION_THRESHOLD_INSTANCES,
            'fallback_mode': 'highlight_by_class',
            'rationale': (
                'When the matched type set covers more than '
                f'{TRUNCATION_THRESHOLD_INSTANCES} instances, the viewer '
                'should highlight by IFC class rather than isolate per '
                'instance — the per-instance render path stalls past this '
                'count.'
            ),
        },
        'notes': (
            'instance_express_ids intentionally omitted from the response. '
            'Per-instance addressing belongs to the viewer, which derives '
            'express IDs locally from ThatOpen fragment data using the '
            'returned type_ids.'
        ),
        'mutations_supporting_dry_run': [],
    })


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(',') if v.strip()]


def _resolve_floor_to_type_ids(project_id: str, floor_code: str) -> list | None:
    """
    Resolve a canonical floor code to the set of IFCType.id values that
    have instances on that floor.

    Returns:
        - None if the floor code is unknown for this project (no canonical
          floor matches by code or alias).
        - [] if the floor exists but no analysis rows cover it (caller
          treats this as 'skipped' too — there's nothing useful to filter
          on).
        - [<uuid>, ...] otherwise.
    """
    scopes = ProjectScope.objects.filter(project_id=project_id)
    target_elevation = None
    storey_merge_tolerance = 0.2

    for scope in scopes:
        for floor in scope.canonical_floors or []:
            code = floor.get('code')
            aliases = floor.get('aliases') or []
            if code == floor_code or floor_code in aliases:
                target_elevation = floor.get('elevation_m')
                storey_merge_tolerance = scope.storey_merge_tolerance_m
                break
        if target_elevation is not None:
            break

    if target_elevation is None:
        return None

    # AnalysisStorey carries the elevation that landed during extraction.
    # Match by absolute delta within the scope's merge tolerance — same band
    # the canonical-floor promotion uses, so the lookup is symmetric.
    storey_qs = AnalysisStorey.objects.filter(
        analysis__model__project_id=project_id,
        elevation__isnull=False,
    ).only('id', 'elevation')

    matching_storey_ids = []
    for storey in storey_qs:
        try:
            if abs(float(storey.elevation) - float(target_elevation)) <= storey_merge_tolerance:
                matching_storey_ids.append(storey.id)
        except (TypeError, ValueError):
            continue

    if not matching_storey_ids:
        return []

    type_ids = (
        AnalysisTypeStorey.objects
        .filter(storey_id__in=matching_storey_ids)
        .values_list('type__ifc_type_id', flat=True)
        .distinct()
    )
    return [tid for tid in type_ids if tid is not None]


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def embed_instances(request):
    """
    Resolve a semantic filter context to type-level data.

    Required: ``project_id``. Optional: ``ifc_class``, ``type_id`` (csv),
    ``floor_code``. Always returns 200 with the result envelope; missing
    project_id is the only 400.
    """
    project_id = request.query_params.get('project_id')
    if not project_id:
        return Response(
            {'detail': 'project_id is required'},
            status=400,
        )

    ifc_class = request.query_params.get('ifc_class')
    type_id_csv = request.query_params.get('type_id')
    floor_code = request.query_params.get('floor_code')

    qs = IFCType.objects.filter(model__project_id=project_id)
    applied_filters = {'project_id': project_id}
    skipped_filters: list[str] = []

    if ifc_class:
        qs = qs.filter(ifc_type=ifc_class)
        applied_filters['ifc_class'] = ifc_class

    type_ids_filter = _split_csv(type_id_csv)
    if type_ids_filter:
        qs = qs.filter(id__in=type_ids_filter)
        applied_filters['type_id'] = type_ids_filter

    if floor_code:
        floor_type_ids = _resolve_floor_to_type_ids(project_id, floor_code)
        if floor_type_ids:
            qs = qs.filter(id__in=floor_type_ids)
            applied_filters['floor_code'] = floor_code
        else:
            skipped_filters.append('floor_code')

    type_ids = list(qs.values_list('id', flat=True))
    instance_count = qs.aggregate(s=Sum('instance_count'))['s'] or 0
    truncated = instance_count > TRUNCATION_THRESHOLD_INSTANCES

    return Response({
        'type_ids': [str(uid) for uid in type_ids],
        'type_count': len(type_ids),
        'instance_count': instance_count,
        'truncated': truncated,
        'threshold_instances': TRUNCATION_THRESHOLD_INSTANCES,
        'applied_filters': applied_filters,
        'skipped_filters': skipped_filters,
    })
