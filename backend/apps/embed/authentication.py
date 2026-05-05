"""
Embed-scoped DRF authentication.

Public read-only ``/api/embed/*`` endpoints accept a capability token instead
of a Supabase session. The token rides the request via either:

- ``Authorization: Embed <raw-token>`` (preferred, used by the iframe page's
  axios client)
- ``?token=<raw-token>`` query param (fallback for environments that can't
  set headers, e.g. a server-side health probe)

Successful authentication returns ``(AnonymousUser, EmbedTokenContext)`` so
``request.user.is_authenticated`` stays ``False`` (the embed surface is not a
human session) while ``request.auth`` carries the token + project scope for
view-level access checks.

Mirrors the short-circuit pattern at
``backend/config/authentication.py:260-318``: returns ``None`` when no token
header/param is present so the auth chain falls through to whatever the
default classes resolve to (relevant for ``/api/embed/tokens/refresh/``,
which authenticates against the OLD raw token).
"""
from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth.models import AnonymousUser
from rest_framework import authentication, exceptions

from apps.embed.models import EmbedToken


AUTH_SCHEME = 'Embed'


@dataclass
class EmbedTokenContext:
    """Attached to ``request.auth`` after a successful embed auth."""
    token: EmbedToken
    project_id: str
    capabilities: list[str]
    allowed_origins: list[str]

    def has_capability(self, cap: str) -> bool:
        return cap in self.capabilities


def _extract_token(request) -> str | None:
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith(f'{AUTH_SCHEME} '):
        return auth_header.split(' ', 1)[1].strip() or None
    return request.query_params.get('token') or None


class EmbedTokenAuthentication(authentication.BaseAuthentication):
    """
    DRF authentication class for the embed surface.
    """

    def authenticate(self, request):
        raw = _extract_token(request)
        if not raw:
            return None  # chain to next auth class (or AllowAny if none)

        token = EmbedToken.find_by_raw(raw)
        if token is None:
            raise exceptions.AuthenticationFailed('Invalid embed token')
        if token.revoked_at is not None:
            raise exceptions.AuthenticationFailed('Token has been revoked')
        if not token.is_active():
            raise exceptions.AuthenticationFailed('Token has expired')

        # Update last_used_at without disturbing other fields.
        token.touch_last_used()

        ctx = EmbedTokenContext(
            token=token,
            project_id=str(token.project_id),
            capabilities=list(token.capabilities or []),
            allowed_origins=list(token.allowed_origins or []),
        )
        return (AnonymousUser(), ctx)

    def authenticate_header(self, request):
        return f'{AUTH_SCHEME} realm="embed"'


class ExpiredOkEmbedTokenAuthentication(EmbedTokenAuthentication):
    """
    Variant used ONLY by ``POST /api/embed/tokens/refresh/``.

    The refresh path needs to verify the OLD token even after it expires,
    within a small grace window. It still rejects revoked tokens and
    unknown tokens.

    Treat this as a narrowly scoped exception, not a general pattern.
    """

    GRACE_SECONDS = 300  # 5 minutes after expiry, refresh is still allowed

    def authenticate(self, request):
        raw = _extract_token(request)
        if not raw:
            return None

        token = EmbedToken.find_by_raw(raw)
        if token is None:
            raise exceptions.AuthenticationFailed('Invalid embed token')
        if token.revoked_at is not None:
            raise exceptions.AuthenticationFailed('Token has been revoked')

        from django.utils import timezone
        from datetime import timedelta
        latest_acceptable = token.expires_at + timedelta(seconds=self.GRACE_SECONDS)
        if timezone.now() > latest_acceptable:
            raise exceptions.AuthenticationFailed('Token expired beyond refresh grace')

        token.touch_last_used()
        ctx = EmbedTokenContext(
            token=token,
            project_id=str(token.project_id),
            capabilities=list(token.capabilities or []),
            allowed_origins=list(token.allowed_origins or []),
        )
        return (AnonymousUser(), ctx)
