"""
Per-token rate limiting for the embed surface.

External dashboards refresh more frequently than human sessions; the
default UserRateThrottle (600/min) is bucket-per-user and would be wrong
for embed traffic where the token, not the user, is the natural caller
identity.

Falls back to IP throttling if no token is on the request, so an
unauthenticated path (e.g. malformed Authorization header bypassing auth)
still gets bounded.
"""
from __future__ import annotations

from rest_framework.throttling import SimpleRateThrottle

from apps.embed.authentication import EmbedTokenContext


class ScopedTokenRateThrottle(SimpleRateThrottle):
    """1000 requests/hour per token (twice the default user budget)."""

    scope = 'embed_token'
    rate = '1000/hour'

    def get_cache_key(self, request, view) -> str | None:
        ctx = request.auth
        if isinstance(ctx, EmbedTokenContext):
            ident = f'token:{ctx.token.id}'
        else:
            ident = f'ip:{self.get_ident(request)}'
        return self.cache_format % {'scope': self.scope, 'ident': ident}
