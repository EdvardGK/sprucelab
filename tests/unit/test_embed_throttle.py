"""
Tests for the per-token rate limiter.

The default test harness disables throttling globally (`_open_permissions`
fixture); these tests opt back in to verify that the cache key is bucketed
per-token rather than per-IP, so two tokens hitting the same endpoint don't
fight for one bucket.
"""
from __future__ import annotations

from unittest.mock import Mock

import pytest

from apps.embed.authentication import EmbedTokenContext
from apps.embed.models import EmbedToken
from apps.embed.throttling import ScopedTokenRateThrottle
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='embed-throttle-test')


def _request_with_token(token: EmbedToken):
    """Minimal Mock that satisfies SimpleRateThrottle's expectations."""
    req = Mock()
    req.auth = EmbedTokenContext(
        token=token,
        project_id=str(token.project_id),
        capabilities=list(token.capabilities or []),
        allowed_origins=list(token.allowed_origins or []),
    )
    req.META = {'REMOTE_ADDR': '127.0.0.1'}
    return req


def test_cache_key_buckets_per_token(project):
    t1, _ = EmbedToken.generate(name='t1', project=project, allowed_origins=['x'])
    t2, _ = EmbedToken.generate(name='t2', project=project, allowed_origins=['x'])

    throttle = ScopedTokenRateThrottle()
    key1 = throttle.get_cache_key(_request_with_token(t1), view=None)
    key2 = throttle.get_cache_key(_request_with_token(t2), view=None)

    assert key1 != key2
    assert str(t1.id) in key1
    assert str(t2.id) in key2


def test_cache_key_falls_back_to_ip_when_no_token():
    """Defense in depth — a request without auth still gets a bucket."""
    throttle = ScopedTokenRateThrottle()
    req = Mock()
    req.auth = None
    req.META = {'REMOTE_ADDR': '10.0.0.1'}
    key = throttle.get_cache_key(req, view=None)
    assert key is not None
    assert 'ip:' in key


def test_throttle_rate_is_configured_from_settings():
    """1000/hour bucket is registered in DEFAULT_THROTTLE_RATES."""
    throttle = ScopedTokenRateThrottle()
    # SimpleRateThrottle parses the rate at first allow_request; force a parse.
    num_requests, duration = throttle.parse_rate(throttle.rate)
    assert num_requests == 1000
    assert duration == 3600
