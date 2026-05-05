"""
Embed-token models.

Scoped capability tokens authenticate external consumers (skiplum-pages and
similar) for the read-only ``/api/embed/*`` surface. A token binds to one
project and a list of allowed parent origins; the JS-side postMessage bus
in the iframe page enforces the origin allowlist for cross-frame messages.

Mirrors the AgentRegistration token-hash pattern at
``apps/automation/models.py:350-401``: store sha256(token), show the raw
value once at creation, verify with ``secrets.compare_digest`` to avoid
timing leaks.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class EmbedToken(models.Model):
    """
    Capability token for the forward-deployed embed surface.

    Project-scoped, time-limited, revocable. Raw value is shown once at
    issuance; the DB stores only sha256 + an 8-char prefix for operator UX
    (`spruce embed pass list` displays the prefix to identify rows).
    """

    DEFAULT_TTL_SECONDS = 3600
    DEFAULT_CAPABILITIES = [
        'read:instances',
        'read:capabilities',
        'read:dashboards',
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text='Operator-facing label')
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='embed_tokens',
    )

    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    prefix = models.CharField(
        max_length=8,
        help_text='First 8 chars of the raw token, used by `spruce embed pass list`',
    )

    allowed_origins = models.JSONField(
        default=list,
        help_text='Exact-match parent origins, e.g. ["https://skiplum-pages.example"]',
    )
    capabilities = models.JSONField(
        default=list,
        help_text='Capability strings; v1 set: read:instances, read:capabilities, read:dashboards',
    )

    ttl_seconds = models.PositiveIntegerField(default=DEFAULT_TTL_SECONDS)
    expires_at = models.DateTimeField(db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='embed_tokens_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'embed_tokens'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'revoked_at']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.prefix}…) → {self.project_id}'

    # ---- factories / verifiers --------------------------------------------

    @classmethod
    def generate(
        cls,
        *,
        name: str,
        project,
        allowed_origins: list[str],
        capabilities: list[str] | None = None,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        created_by=None,
    ) -> tuple['EmbedToken', str]:
        """
        Create a new token. Returns ``(EmbedToken, raw_token)``.
        ``raw_token`` is shown ONCE — never stored.
        """
        raw = secrets.token_urlsafe(32)
        token = cls.objects.create(
            name=name,
            project=project,
            token_hash=_hash_token(raw),
            prefix=raw[:8],
            allowed_origins=list(allowed_origins or []),
            capabilities=list(capabilities or cls.DEFAULT_CAPABILITIES),
            ttl_seconds=ttl_seconds,
            expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
            created_by=created_by,
        )
        return token, raw

    def verify(self, raw: str) -> bool:
        """Constant-time comparison of the supplied token against the stored hash."""
        return secrets.compare_digest(_hash_token(raw), self.token_hash)

    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > timezone.now()

    def has_origin(self, origin: str) -> bool:
        return origin in (self.allowed_origins or [])

    def has_capability(self, capability: str) -> bool:
        return capability in (self.capabilities or [])

    def touch_last_used(self) -> None:
        self.last_used_at = timezone.now()
        self.save(update_fields=['last_used_at'])

    def revoke(self, reason: str = '') -> None:
        if self.revoked_at is not None:
            return
        self.revoked_at = timezone.now()
        self.revoked_reason = reason[:255]
        self.save(update_fields=['revoked_at', 'revoked_reason'])

    # ---- lookup helper -----------------------------------------------------

    @classmethod
    def find_by_raw(cls, raw: str) -> 'EmbedToken | None':
        if not raw:
            return None
        return cls.objects.filter(token_hash=_hash_token(raw)).first()
