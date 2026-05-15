"""
Root-level auth / identity / health / capability views.
"""

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db import connection
from django.http import HttpResponse
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt

from apps.accounts.models import UserProfile


API_VERSION = '1.0'


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])  # Capability discovery is itself a feature — no auth, no rate limit.
def capabilities(request):
    """
    Public capability manifest. Lets agents discover what the API can do
    without scraping docs.

    Stable contract — additive changes only. Increment ``api_version`` for
    breaking changes.
    """
    from apps.models.models import SourceFile  # local import to avoid app-init cycles

    return Response({
        'api_version': API_VERSION,
        'service': 'sprucelab-django',
        'file_formats': [code for code, _ in SourceFile.FORMAT_CHOICES],
        'mutations_supporting_dry_run': [
            'POST /api/types/type-mappings/bulk-update/',
            'POST /api/types/type-definition-layers/bulk-update/',
            'POST /api/types/claims/{id}/promote/',
            'POST /api/types/claims/{id}/reject/',
            'POST /api/types/claims/{id}/supersede/',
            'PATCH /api/projects/scopes/{id}/',
            'POST /api/automation/webhook-subscriptions/',
            'POST /api/filters/saved/',
            'PATCH /api/filters/saved/{id}/',
            'POST /api/types/types/verify/',
        ],
        'extraction_pipelines': {
            'ifc': 'fastapi:/api/v1/ifc/extract',
            'pdf': 'django:/api/files/{id}/extract/ → drawing+document extractors',
            'docx': 'django:/api/files/{id}/extract/ → document extractor',
            'xlsx': 'django:/api/files/{id}/extract/ → document extractor',
            'pptx': 'django:/api/files/{id}/extract/ → document extractor',
            'dxf': 'django:/api/files/{id}/extract/ → drawing extractor',
        },
        'verification': {
            'engine_endpoint': 'POST /api/types/types/verify/?model={id}',
            'rule_sources': ['DEFAULT_RULES', 'ProjectConfig.config[claim_derived_rules]', 'ProjectConfig.config[verification][rules]'],
            'rule_id_prefixes': {
                'claim:': 'derived from a promoted Claim — see /api/types/types/claim-issues/',
            },
        },
        'events': {
            'wired': [
                'model.processed',
                'document.processed',
                'claim.extracted',
                'verification.complete',
                'floor.canonical.changed',
            ],
            'planned': [
                'types.classified',
                'quantities.extracted',
            ],
            'signing': 'hmac-sha256',
            'signature_header': 'X-Webhook-Signature',
            'timestamp_header': 'X-Webhook-Timestamp',
            'event_header': 'X-Webhook-Event',
            'delivery_id_header': 'X-Webhook-Delivery-Id',
            'subscription_endpoint': '/api/automation/webhook-subscriptions/',
            'delivery_log_endpoint': '/api/automation/webhook-deliveries/',
        },
        'embed': {
            'capabilities_endpoint': '/api/embed/capabilities/',
            'instances_endpoint': '/api/embed/instances/',
            'iframe_path': '/embed/{dashboard}?token={scoped_token}',
            'protocol_version': 1,
            'token_endpoints': {
                'collection': '/api/embed/tokens/',
                'detail': '/api/embed/tokens/{id_or_prefix}/',
                'refresh': '/api/embed/tokens/refresh/',
            },
            'auth': {
                'scheme': 'Embed',
                'header': 'Authorization',
                'query_param': 'token',
                'admin_endpoints_require_staff': True,
            },
        },
        # CLI verticals — agents that prefer a process-spawn surface over raw
        # HTTP can pipe `spruce <group> <cmd> --json`. Names are stable; new
        # groups are additive only. Keep alphabetized.
        'cli_commands': {
            'capabilities': 'spruce capabilities [--json]',
            'files': [
                'spruce files list [--project] [--format] [--current-only] [--json]',
                'spruce files show <id> [--json]',
                'spruce files upload <path> --project <uuid> [--on-duplicate ask|use_existing|replace]',
                'spruce files download <id> [--out PATH] [--overwrite]',
                'spruce files reprocess <id> [--json]',
                'spruce files versions <id> [--json]',
            ],
            'log': 'spruce log list [--project] [--source-file] [--category] [--json]',
            'models': 'spruce models list [--project-id] [--json]',
            'types': 'spruce types list [--model] [--json]',
            'verify': 'spruce verify --model <id> [--dry-run] [--json]',
            'webhooks': 'spruce webhooks {list,create,disable,delete,deliveries,redeliver,test}',
        },
        # Site-scan discovery surfaces. Agents that crawl us blind can find
        # these without hitting human docs first.
        'discovery': {
            'agent_tools_manifest': '/.well-known/agent-tools.json',
            'llms_txt': '/llms.txt',
            'marketing_for_agents': 'https://www.sprucelab.io/agents',
            'benchmarks': 'https://www.sprucelab.io/benchmarks',
        },
        # Native MCP protocol surface. Agents that prefer typed tool calls
        # over raw HTTP can install the server and get the same capabilities
        # as a Claude/Cursor tool catalog.
        'mcp': {
            'package_name': 'sprucelab-mcp',
            'install': 'pip install sprucelab-mcp',
            'invocation': 'sprucelab-mcp',
            'protocol_version': '2024-11-05',
            'transport': 'stdio',
            'config_example': {
                'mcpServers': {
                    'sprucelab': {'command': 'sprucelab-mcp'},
                },
            },
        },
        # Parser used by the IFC extraction layer. Stamped so an agent can
        # decide whether to call us or roll its own based on the perf
        # numbers we cite on the benchmarks page.
        'parser': {
            'ifc': 'ifcfast',
            'ifc_version_min': '0.1.0',
            'fallback': 'ifcopenshell',
            'tier_1_speedup_vs_ifcopenshell': '25x-47x',
            'audit_url': 'https://www.sprucelab.io/benchmarks',
            'source_repo': 'https://github.com/EdvardGK/ifcfast',
        },
    })


# ---------------------------------------------------------------------------
# Agent discovery surfaces
#
# Two unauthenticated endpoints sized for site-scan: agents that crawl a
# domain blind should be able to discover Sprucelab without needing a human
# to point them at the docs URL.
#
#   /.well-known/agent-tools.json — JSON manifest (verbs, endpoints, auth)
#   /llms.txt                     — plain-text LLM-targeted README
#
# Both surfaces are public, throttling-exempt, and intentionally additive
# alongside /api/capabilities/. Treat the keys as a stable contract — drop
# nothing, only add.
# ---------------------------------------------------------------------------


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])  # Discovery surface — agents may hit this on cold start.
def agent_tools_manifest(request):
    """
    Public agent-tools manifest served from the conventional well-known path.

    Format follows the informal `/.well-known/agent-tools.json` convention used
    by agentic crawlers: one stable JSON document advertising the API base, the
    primary discovery endpoints, the CLI install + verbs, and the high-level
    extraction surface.

    ``api_base`` is computed from the request so reverse-proxied deployments
    (Railway behind sprucelab.no) report the right absolute URL without config.
    """
    api_base = request.build_absolute_uri('/').rstrip('/')

    return Response({
        'schema_version': '0.1',
        'name': 'Sprucelab',
        'tagline': (
            'Data-first BIM intelligence: every file becomes a queryable '
            'data stream.'
        ),
        'homepage': 'https://sprucelab.no',
        'endpoints': {
            'api_base': api_base,
            'capabilities': '/api/capabilities/',
            'embed_capabilities': '/api/embed/capabilities/',
            'health': '/api/health/',
            'auth': {
                'scheme': 'Bearer',
                'header': 'Authorization',
                'register_endpoint': '/api/automation/agent/register/',
                'docs': (
                    "Use 'spruce auth register --token <KEY> --url <URL>' or "
                    "pass 'Authorization: Bearer <KEY>' on every request."
                ),
            },
        },
        'cli': {
            'package_name': 'spruce',
            'install': 'pip install -e cli/  (from sprucelab repo)',
            'elevator_pitch': (
                "Run 'spruce capabilities' for the full command catalog."
            ),
        },
        'mcp': {
            'package_name': 'sprucelab-mcp',
            'install': 'pip install sprucelab-mcp',
            'invocation': 'sprucelab-mcp',
            'config_example': {
                'mcpServers': {
                    'sprucelab': {'command': 'sprucelab-mcp'},
                },
            },
        },
        'parser': {
            'ifc': 'ifcfast',
            'fallback': 'ifcopenshell',
            'tier_1_speedup_vs_ifcopenshell': '25x-47x',
            'audit_url': 'https://www.sprucelab.io/benchmarks',
        },
        'verbs': [
            {
                'command': 'spruce capabilities',
                'purpose': 'Discover the full agent surface',
                'auth': False,
            },
            {
                'command': 'spruce models list --project <UUID>',
                'purpose': 'List uploaded BIM models',
                'auth': True,
            },
            {
                'command': 'spruce log list --project <UUID>',
                'purpose': 'Drill the observation log of extracted facts',
                'auth': True,
            },
            {
                'command': 'spruce verify --dry-run --model <UUID>',
                'purpose': 'Preview verification output without persisting',
                'auth': True,
            },
        ],
        'what_we_extract': [
            'IFC: types (not entities), spatial hierarchy, classification, materials',
            'DXF/DWG: layers, text blocks, title-block fields',
            'PDF (drawing sheets): heuristic title-block, sheet metadata',
            'PDF/DOCX/XLSX/PPTX: documents, claim candidates from prose',
        ],
        'good_use_cases': [
            'Verify a delivered IFC model against project requirements',
            'Compare floor/storey data across IFC models',
            'Cross-classify types (NS3451) reused across projects',
            'Extract claim candidates from documents and feed them back as ProjectConfig',
        ],
        'conventions': {
            'dry_run': (
                "All listed mutations support ?dry_run=true; see "
                "/api/capabilities/ → mutations_supporting_dry_run."
            ),
            'errors': (
                'JSON envelope with detail + structured codes. Duplicate-upload '
                "responses include 'duplicate: true'."
            ),
            'webhooks': (
                'HMAC-SHA256, X-Webhook-Signature header. See '
                '/api/capabilities/ → events for the full event taxonomy.'
            ),
        },
    })


LLMS_TXT_BODY = """\
# Sprucelab

> Data-first BIM intelligence: every file becomes a queryable data stream.
> Agent-first, human-second. The BIM platform agents reach for.

## Cold-start
- One curl: `curl https://api.sprucelab.io/api/capabilities/`
- Marketing landing for agents: https://www.sprucelab.io/agents
- Benchmarks (25-47x faster than ifcopenshell on tier-1 parse): https://www.sprucelab.io/benchmarks

## Discovery
- [Capabilities (machine-readable)](/api/capabilities/)
- [Embed capabilities](/api/embed/capabilities/)
- [Agent tools manifest](/.well-known/agent-tools.json)
- [Health](/api/health/)

## MCP (native protocol)
- Install: `pip install sprucelab-mcp`
- Claude Desktop / Cursor config:
  `{"mcpServers": {"sprucelab": {"command": "sprucelab-mcp"}}}`

## CLI
- Install: `pip install -e cli/` (from the sprucelab repo)
- Catalog: `spruce capabilities`
- Auth: `spruce auth register --token <KEY> --url <URL>`
  (or send `Authorization: Bearer <KEY>` directly)

## Common tasks
- List models: `spruce models list --project <UUID>`
- Drill the observation log: `spruce log list --project <UUID>`
- Preview verification: `spruce verify --dry-run --model <UUID>`

## Conventions
- All mutations support `?dry_run=true` where applicable
  (see `/api/capabilities/` → `mutations_supporting_dry_run`)
- Errors are JSON: check `detail` and (for duplicates) the `duplicate: true` flag
- Webhooks: HMAC-SHA256, header `X-Webhook-Signature`
- Token registration: `POST /api/automation/agent/register/`

## Stack
- IFC parser: ifcfast (Rust + Python, MIT, 25-47x faster than ifcopenshell on tier-1)
  https://github.com/EdvardGK/ifcfast
"""


@csrf_exempt
@require_GET
def llms_txt(request):
    """
    Plain-text LLM-targeted README, served at the root.

    Follows the informal https://llmstxt.org/ convention: a Markdown-flavoured
    plaintext index of the most useful URLs and CLI verbs, sized for an agent
    to ingest in one fetch on cold start. Public, no auth, no rate limit.

    Served as ``text/plain; charset=utf-8`` so naive crawlers don't try to
    HTML-render it.
    """
    return HttpResponse(LLMS_TXT_BODY, content_type='text/plain; charset=utf-8')


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])  # Exempt from rate limiting so Railway health probes never fail
def health_check(request):
    """Health check endpoint for Railway/load balancers."""
    db_ok = False
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    status = "healthy" if db_ok else "degraded"

    return Response({
        'status': status,
        'service': 'sprucelab-django',
        'database': 'ok' if db_ok else 'error',
    }, status=200 if db_ok else 503)


def _serialize_profile(user):
    """Return the current user's identity + approval state."""
    profile = getattr(user, 'profile', None)
    if profile is None:
        profile = UserProfile.objects.filter(user=user).first()

    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'date_joined': user.date_joined,
        'profile': {
            'supabase_id': str(profile.supabase_id) if profile else None,
            'display_name': profile.display_name if profile else '',
            'avatar_url': profile.avatar_url if profile else '',
            'approval_status': profile.approval_status if profile else UserProfile.APPROVAL_PENDING,
            'approved_at': profile.approved_at if profile else None,
            'signup_metadata': profile.signup_metadata if profile else {},
            'created_at': profile.created_at if profile else None,
        } if profile else None,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    """
    Return the authenticated user + profile + approval state.

    Deliberately uses IsAuthenticated (not IsApprovedUser) so unapproved users
    can poll this endpoint from the waitlist page to detect approval.
    """
    return Response(_serialize_profile(request.user))


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """
    Update the current user's signup_metadata and display_name.

    Accepts:
      - display_name: str
      - signup_metadata: dict (merged into existing; pass {} to clear a key
        explicitly — top-level keys are merged, not replaced recursively)
    """
    profile = getattr(request.user, 'profile', None)
    if profile is None:
        profile = UserProfile.objects.filter(user=request.user).first()
    if profile is None:
        return Response({'error': 'Profile not found'}, status=404)

    dirty = []
    display_name = request.data.get('display_name')
    if display_name is not None:
        profile.display_name = display_name[:255]
        dirty.append('display_name')

    incoming_meta = request.data.get('signup_metadata')
    if isinstance(incoming_meta, dict):
        merged = dict(profile.signup_metadata or {})
        merged.update(incoming_meta)
        profile.signup_metadata = merged
        dirty.append('signup_metadata')

    if dirty:
        profile.save(update_fields=dirty + ['updated_at'])

    return Response(_serialize_profile(request.user))
