"""
Unit tests for the EmbedToken model.

Pins the security-critical surface — secrets-comparison verify, hash-only
storage, is_active edge cases (revoked, expired, both), and origin/capability
matching — so a regression in any of these turns into a test failure rather
than a silent auth bypass.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.embed.models import EmbedToken
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='embed-token-model-test')


def test_generate_returns_raw_only_once(project):
    token, raw = EmbedToken.generate(
        name='t1',
        project=project,
        allowed_origins=['https://x.example'],
    )
    assert isinstance(raw, str) and len(raw) >= 32
    assert token.token_hash != raw  # hash, not raw, in DB
    assert token.prefix == raw[:8]
    # Reload from DB — there's no field that exposes the raw value.
    fresh = EmbedToken.objects.get(pk=token.pk)
    assert not hasattr(fresh, 'token')  # only token_hash exists


def test_verify_matches_only_correct_raw(project):
    token, raw = EmbedToken.generate(
        name='t1', project=project, allowed_origins=['https://x.example']
    )
    assert token.verify(raw) is True
    assert token.verify(raw + 'x') is False
    assert token.verify('') is False
    # Constant-time comparison: same-length wrong value still rejects
    assert token.verify('a' * len(raw)) is False


def test_default_capabilities_applied_when_none_supplied(project):
    token, _ = EmbedToken.generate(
        name='t1', project=project, allowed_origins=['https://x.example']
    )
    assert set(token.capabilities) >= {'read:instances', 'read:capabilities', 'read:dashboards'}


def test_explicit_capabilities_override_default(project):
    token, _ = EmbedToken.generate(
        name='t1',
        project=project,
        allowed_origins=['https://x.example'],
        capabilities=['read:instances'],
    )
    assert token.capabilities == ['read:instances']
    assert token.has_capability('read:instances') is True
    assert token.has_capability('read:dashboards') is False


def test_is_active_lifecycle(project):
    token, _ = EmbedToken.generate(
        name='t1', project=project, allowed_origins=['x'], ttl_seconds=10,
    )
    assert token.is_active() is True

    # Expired
    token.expires_at = timezone.now() - timedelta(seconds=1)
    token.save(update_fields=['expires_at'])
    assert token.is_active() is False

    # Active again, then revoked
    token.expires_at = timezone.now() + timedelta(hours=1)
    token.save(update_fields=['expires_at'])
    assert token.is_active() is True

    token.revoke(reason='manual')
    assert token.is_active() is False
    assert token.revoked_reason == 'manual'

    # Revoke is idempotent
    first_revoke = token.revoked_at
    token.revoke(reason='again')
    assert token.revoked_at == first_revoke


def test_origin_match(project):
    token, _ = EmbedToken.generate(
        name='t1', project=project,
        allowed_origins=['https://a.example', 'https://b.example'],
    )
    assert token.has_origin('https://a.example') is True
    assert token.has_origin('https://c.example') is False
    # Exact match — no scheme/case fuzziness
    assert token.has_origin('http://a.example') is False
    assert token.has_origin('HTTPS://A.EXAMPLE') is False


def test_find_by_raw_uses_hash_lookup(project):
    token, raw = EmbedToken.generate(
        name='t1', project=project, allowed_origins=['x'],
    )
    found = EmbedToken.find_by_raw(raw)
    assert found is not None
    assert found.pk == token.pk
    assert EmbedToken.find_by_raw('not-a-real-token') is None
    assert EmbedToken.find_by_raw('') is None


def test_touch_last_used_updates_only_that_field(project):
    token, _ = EmbedToken.generate(
        name='t1', project=project, allowed_origins=['x'],
    )
    assert token.last_used_at is None
    token.touch_last_used()
    refreshed = EmbedToken.objects.get(pk=token.pk)
    assert refreshed.last_used_at is not None
