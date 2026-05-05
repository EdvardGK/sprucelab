"""
Pure-function service layer for EmbedToken lifecycle. Reused by:
- the management command (`python manage.py embed_token …`)
- the admin DRF endpoints (`POST/GET/DELETE /api/embed/tokens/…`)
- the spruce CLI (`spruce embed pass …`) via the admin endpoints.

Keeping the operations here makes them trivially testable without booting
DRF, and keeps the views skinny.
"""
from __future__ import annotations

from typing import Iterable

from django.db.models import QuerySet

from apps.embed.models import EmbedToken
from apps.projects.models import Project


class EmbedTokenError(Exception):
    """Base for service-layer issues callers should turn into HTTP 4xx."""


class TokenNotFound(EmbedTokenError):
    pass


class TokenInactive(EmbedTokenError):
    """Token is revoked or expired — refresh refuses unless within grace."""


def issue_token(
    *,
    name: str,
    project: Project,
    allowed_origins: list[str],
    capabilities: Iterable[str] | None = None,
    ttl_seconds: int = EmbedToken.DEFAULT_TTL_SECONDS,
    created_by=None,
) -> tuple[EmbedToken, str]:
    """Mint a fresh token. Returns (token, raw); raw shown ONCE."""
    return EmbedToken.generate(
        name=name,
        project=project,
        allowed_origins=allowed_origins,
        capabilities=list(capabilities) if capabilities is not None else None,
        ttl_seconds=ttl_seconds,
        created_by=created_by,
    )


def list_tokens(
    *,
    project: Project | None = None,
    include_revoked: bool = False,
) -> QuerySet[EmbedToken]:
    qs = EmbedToken.objects.all()
    if project is not None:
        qs = qs.filter(project=project)
    if not include_revoked:
        qs = qs.filter(revoked_at__isnull=True)
    return qs


def revoke_token(*, token_id_or_prefix: str, reason: str = '') -> EmbedToken:
    """
    Revoke by full UUID or 8-char prefix. Idempotent — re-revoking is a
    no-op rather than an error so operators can rerun the command safely.
    """
    token = _resolve(token_id_or_prefix)
    token.revoke(reason=reason)
    return token


def refresh_token(*, raw_token: str) -> tuple[EmbedToken, str]:
    """
    Rotate (not extend) a token: validate the supplied raw token, mint a new
    one with the same scope, revoke the old. Returns (new_token, new_raw).
    Stateful refresh — old token is dead the moment this returns.
    """
    old = EmbedToken.find_by_raw(raw_token)
    if old is None:
        raise TokenNotFound('token not recognised')
    if old.revoked_at is not None:
        raise TokenInactive('token already revoked')

    new_token, new_raw = EmbedToken.generate(
        name=old.name,
        project=old.project,
        allowed_origins=list(old.allowed_origins or []),
        capabilities=list(old.capabilities or []),
        ttl_seconds=old.ttl_seconds,
        created_by=old.created_by,
    )
    old.revoke(reason=f'rotated → {new_token.id}')
    return new_token, new_raw


def _resolve(token_id_or_prefix: str) -> EmbedToken:
    """Look up by full UUID, falling back to 8-char prefix."""
    if not token_id_or_prefix:
        raise TokenNotFound('empty identifier')

    qs = EmbedToken.objects.filter(id=token_id_or_prefix) if _looks_like_uuid(token_id_or_prefix) \
        else EmbedToken.objects.filter(prefix=token_id_or_prefix)

    matches = list(qs[:2])
    if not matches:
        raise TokenNotFound(f'no token matches {token_id_or_prefix!r}')
    if len(matches) > 1:
        raise EmbedTokenError(
            f'prefix {token_id_or_prefix!r} matches multiple tokens; pass a full id'
        )
    return matches[0]


def _looks_like_uuid(value: str) -> bool:
    return len(value) == 36 and value.count('-') == 4
