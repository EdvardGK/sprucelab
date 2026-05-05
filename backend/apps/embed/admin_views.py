"""
Admin endpoints for embed-token lifecycle.

Separated from ``views.py`` (which holds the public read-only resolver) so
the auth posture is unambiguous: anything in this module requires a
Supabase-authenticated staff user, except ``/tokens/refresh/`` which
authenticates against the OLD raw token.

Endpoints:
    POST   /api/embed/tokens/         — issue, returns raw token ONCE
    GET    /api/embed/tokens/         — list (no raw values)
    DELETE /api/embed/tokens/<id>/    — revoke (idempotent)
    POST   /api/embed/tokens/refresh/ — rotate (caller authenticates with old token)
"""
from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.response import Response

from apps.embed.authentication import (
    EmbedTokenContext,
    ExpiredOkEmbedTokenAuthentication,
)
from apps.embed.models import EmbedToken
from apps.embed.services import token_service
from apps.projects.models import Project


def _serialize(token: EmbedToken, *, include_raw: str | None = None) -> dict:
    payload = {
        'id': str(token.id),
        'name': token.name,
        'project_id': str(token.project_id),
        'prefix': token.prefix,
        'allowed_origins': list(token.allowed_origins or []),
        'capabilities': list(token.capabilities or []),
        'ttl_seconds': token.ttl_seconds,
        'expires_at': token.expires_at.isoformat() if token.expires_at else None,
        'created_at': token.created_at.isoformat() if token.created_at else None,
        'last_used_at': token.last_used_at.isoformat() if token.last_used_at else None,
        'revoked_at': token.revoked_at.isoformat() if token.revoked_at else None,
        'revoked_reason': token.revoked_reason,
    }
    if include_raw is not None:
        payload['raw_token'] = include_raw
    return payload


class IsStaff(permissions.BasePermission):
    """Restricts admin token endpoints to staff users only."""

    message = 'Admin embed-token endpoints require staff access.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


@api_view(['POST', 'GET'])
@permission_classes([IsStaff])
def tokens_collection(request):
    """Issue a new token (POST) or list existing tokens (GET)."""
    if request.method == 'GET':
        project_id = request.query_params.get('project_id')
        include_revoked = request.query_params.get('include_revoked', '').lower() in (
            '1', 'true', 'yes',
        )
        project = None
        if project_id:
            project = Project.objects.filter(id=project_id).first()
            if project is None:
                return Response({'detail': 'project not found'}, status=404)

        qs = token_service.list_tokens(project=project, include_revoked=include_revoked)
        return Response({
            'count': qs.count(),
            'results': [_serialize(t) for t in qs],
        })

    # POST /tokens/ — issue
    payload = request.data or {}
    name = (payload.get('name') or '').strip()
    project_id = payload.get('project_id')
    allowed_origins = payload.get('allowed_origins') or []
    capabilities = payload.get('capabilities')
    ttl_seconds = payload.get('ttl_seconds') or EmbedToken.DEFAULT_TTL_SECONDS

    errors = {}
    if not name:
        errors['name'] = 'required'
    if not project_id:
        errors['project_id'] = 'required'
    if not isinstance(allowed_origins, list) or not allowed_origins:
        errors['allowed_origins'] = 'must be a non-empty list of origin strings'
    if errors:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    project = Project.objects.filter(id=project_id).first()
    if project is None:
        return Response({'detail': 'project not found'}, status=404)

    try:
        ttl_seconds = int(ttl_seconds)
    except (TypeError, ValueError):
        return Response({'errors': {'ttl_seconds': 'must be a positive integer'}}, status=400)
    if ttl_seconds <= 0:
        return Response({'errors': {'ttl_seconds': 'must be > 0'}}, status=400)

    token, raw = token_service.issue_token(
        name=name,
        project=project,
        allowed_origins=list(allowed_origins),
        capabilities=capabilities,
        ttl_seconds=ttl_seconds,
        created_by=request.user,
    )
    return Response(_serialize(token, include_raw=raw), status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsStaff])
def tokens_detail(request, token_id):
    """Revoke a token by id (or 8-char prefix). Idempotent."""
    reason = (request.data or {}).get('reason') or request.query_params.get('reason') or ''
    try:
        token = token_service.revoke_token(token_id_or_prefix=token_id, reason=reason)
    except token_service.TokenNotFound as e:
        return Response({'detail': str(e)}, status=404)
    except token_service.EmbedTokenError as e:
        return Response({'detail': str(e)}, status=400)
    return Response(_serialize(token))


@api_view(['POST'])
@authentication_classes([ExpiredOkEmbedTokenAuthentication])
@permission_classes([permissions.AllowAny])
def tokens_refresh(request):
    """
    Rotate the supplied embed token. Caller authenticates with the OLD raw
    value via ``Authorization: Embed <raw>`` (or ``?token=`` query param).
    Returns the new token; the old token is revoked atomically.
    """
    ctx = request.auth
    if not isinstance(ctx, EmbedTokenContext):
        return Response({'detail': 'embed token required'}, status=401)

    # The auth class already verified the old token; extract the raw to feed
    # the rotation. We re-derive from the request rather than trust auth
    # state, so that audits can match the rotation against the literal value.
    auth_header = request.headers.get('Authorization', '')
    raw = auth_header.split(' ', 1)[1].strip() if auth_header.startswith('Embed ') else \
        request.query_params.get('token', '')

    try:
        token, new_raw = token_service.refresh_token(raw_token=raw)
    except token_service.TokenNotFound as e:
        return Response({'detail': str(e)}, status=404)
    except token_service.TokenInactive as e:
        return Response({'detail': str(e)}, status=409)
    return Response(_serialize(token, include_raw=new_raw), status=status.HTTP_201_CREATED)
