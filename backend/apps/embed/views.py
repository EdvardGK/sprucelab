"""
Forward-deployed embed: semantic-to-concrete filter resolver.

Turns a semantic filter context ({ifc_class: "IfcWall", floor_code: "03"})
into the type-level data the embed viewer and tiles need. Per-instance
express IDs are intentionally NOT returned: they aren't stored server-side
(see CLAUDE.md "We DON'T store individual entities"), and the viewer derives
them locally from ThatOpen fragment data.

Both endpoints authenticate via ``EmbedTokenAuthentication`` and require a
project-scoped capability token. The token's ``project_id`` is the source
of truth — any caller-supplied ``project_id`` query param must match.
"""
from __future__ import annotations

from django.db.models import Sum
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.embed.authentication import EmbedTokenAuthentication, EmbedTokenContext
from apps.embed.throttling import ScopedTokenRateThrottle


def _require_capability(request, capability: str) -> Response | None:
    """
    Inline capability gate. ``api_view`` doesn't propagate function
    attributes onto the wrapping view class, so a permission-class with
    ``view.required_capability`` lookup never sees the value. Inlining
    keeps the gate readable and pinned to the endpoint that needs it.

    Returns a 401/403 Response when access is denied, ``None`` when the
    request may proceed.
    """
    ctx = request.auth
    if not isinstance(ctx, EmbedTokenContext):
        return Response(
            {'detail': 'embed token required'},
            status=401,
        )
    if not ctx.has_capability(capability):
        return Response(
            {'error': 'capability_missing', 'required': capability},
            status=403,
        )
    return None
from apps.entities.models import (
    AnalysisStorey,
    AnalysisTypeStorey,
    IFCType,
)
from apps.projects.models import ProjectScope


EMBED_API_VERSION = '1.1'

# Truncation threshold (per edkjo Q2 from the embed plan). When the matched
# type set covers more than this many instances, the viewer should fall back
# to highlight-by-class instead of per-instance isolation. Tuned by viewer
# perf — revisit once the highlight-mode spike numbers land.
TRUNCATION_THRESHOLD_INSTANCES = 2500


@api_view(['GET'])
@authentication_classes([EmbedTokenAuthentication])
@permission_classes([AllowAny])
@throttle_classes([ScopedTokenRateThrottle])
def embed_capabilities(request):
    """
    Embed filter-resolver capability manifest.

    Token-bound: callers see only the surface their token allows. The
    response includes the token's ``project_id`` and ``allowed_origins``
    so the iframe page can short-circuit unauthorised parents on mount
    without an extra round-trip.
    """
    denied = _require_capability(request, 'read:capabilities')
    if denied is not None:
        return denied
    ctx: EmbedTokenContext = request.auth
    return Response({
        'api_version': EMBED_API_VERSION,
        'service': 'sprucelab-embed-resolver',
        'protocol_version': 1,
        'token': {
            'project_id': ctx.project_id,
            'allowed_origins': ctx.allowed_origins,
            'capabilities': ctx.capabilities,
            'expires_at': ctx.token.expires_at.isoformat() if ctx.token.expires_at else None,
        },
        'endpoints': {
            'instances': '/api/embed/instances/',
            'capabilities': '/api/embed/capabilities/',
            'token_refresh': '/api/embed/tokens/refresh/',
        },
        'supported_filters': {
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
        'auth': {
            'scheme': 'Embed',
            'header': 'Authorization',
            'query_param': 'token',
        },
        'notes': (
            'instance_express_ids intentionally omitted from the response. '
            'Per-instance addressing belongs to the viewer, which derives '
            'express IDs locally from ThatOpen fragment data using the '
            'returned type_ids.'
        ),
        'mutations_supporting_dry_run': [
            'POST /api/types/types/verify/',
        ],
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
@authentication_classes([EmbedTokenAuthentication])
@permission_classes([AllowAny])
@throttle_classes([ScopedTokenRateThrottle])
def embed_instances(request):
    """
    Resolve a semantic filter context to type-level data.

    Project scope comes from the token. Optional: ``ifc_class``,
    ``type_id`` (csv), ``floor_code``. Always returns 200 with the result
    envelope. A caller-supplied ``project_id`` must match the token's
    project; mismatched values return 403.
    """
    denied = _require_capability(request, 'read:instances')
    if denied is not None:
        return denied
    ctx: EmbedTokenContext = request.auth
    project_id = ctx.project_id

    supplied = request.query_params.get('project_id')
    if supplied and supplied != project_id:
        return Response(
            {'detail': 'project_id does not match token scope'},
            status=403,
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
