"""
Root-level auth / identity / health / capability views.
"""

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db import connection

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
    })


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
