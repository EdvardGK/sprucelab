"""
Agent token authentication + scope gating.

Covers:
  - Bearer token authenticates a registered agent against the broad REST
    surface (GET /api/types/observations/, GET /api/types/types/, etc.)
  - read_only scope blocks POST / PATCH / DELETE
  - operator scope allows data writes but blocks user/agent admin paths
  - admin scope allows everything
  - Invalid token: silently skipped (other auth classes can still try)
  - Supabase-style JWT tokens are skipped by AgentTokenAuthentication
  - last_seen_at is bumped on successful auth
  - create_agent management command issues a usable token
"""
from __future__ import annotations

import io
import hashlib
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.automation.models import AgentRegistration


@pytest.fixture(autouse=True)
def _real_auth_and_permissions(settings, monkeypatch):
    """
    Restore real auth + permission classes for this file.

    The project-wide autouse fixture in tests/conftest.py opens
    permissions to AllowAny so the data-pipeline tests don't need to
    wire authn. Here we actually want the gate to fire.

    DRF caches `api_settings` per-process, so mutating `settings.REST_FRAMEWORK`
    only partly works — we ALSO monkeypatch each ViewSet's own
    `permission_classes` / `authentication_classes` attributes so they read
    the right values regardless of caching.
    """
    from config.authentication import AgentTokenAuthentication
    from apps.accounts.permissions import IsApprovedUser
    from apps.entities.views.observations import ObservationViewSet
    from apps.entities.views.types import TypeMappingViewSet
    from apps.automation.views import AgentRegisterView

    settings.REST_FRAMEWORK = {
        **getattr(settings, 'REST_FRAMEWORK', {}),
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'config.authentication.AgentTokenAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': [
            'apps.accounts.permissions.IsApprovedUser',
        ],
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {},
    }

    for vs in (ObservationViewSet, TypeMappingViewSet, AgentRegisterView):
        monkeypatch.setattr(vs, 'authentication_classes', [AgentTokenAuthentication])
        monkeypatch.setattr(vs, 'permission_classes', [IsApprovedUser])


def _make_agent(name: str, scope: str = 'operator', is_active: bool = True):
    key, key_hash = AgentRegistration.generate_api_key()
    agent = AgentRegistration.objects.create(
        name=name,
        hostname='cli',
        scope=scope,
        is_active=is_active,
        api_key_hash=key_hash,
    )
    return agent, key


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_bearer_token_authenticates_against_observations(api_client):
    _, key = _make_agent('reader-1', scope='read_only')
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    resp = api_client.get('/api/types/observations/')
    assert resp.status_code == 200, resp.content


@pytest.mark.django_db
def test_read_only_scope_blocks_post(api_client):
    _, key = _make_agent('reader-2', scope='read_only')
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    # Hit a known POST endpoint — type-mappings bulk-update.
    resp = api_client.post('/api/types/type-mappings/bulk-update/', {}, format='json')
    assert resp.status_code in (403, 400, 405), resp.content
    # Specifically not 401 (auth) and not 200 (success). 403 is the canonical
    # answer; backends may also produce 400/405 if scope check passes but the
    # body is invalid — read_only should never reach those.
    assert resp.status_code == 403, f'expected scope 403, got {resp.status_code}: {resp.content!r}'


@pytest.mark.django_db
def test_operator_scope_allows_data_writes_blocks_agent_register(api_client):
    _, key = _make_agent('worker-1', scope='operator')
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')

    # Data write: should pass the scope check (may fail body validation).
    resp_write = api_client.post('/api/types/type-mappings/bulk-update/', {}, format='json')
    assert resp_write.status_code != 403, resp_write.content

    # Admin-only path: agent registration mint.
    resp_admin = api_client.post('/api/automation/agent/register/', {
        'name': 'should-fail',
        'hostname': 'x',
    }, format='json')
    assert resp_admin.status_code == 403, resp_admin.content


@pytest.mark.django_db
def test_admin_scope_allows_admin_paths(api_client):
    _, key = _make_agent('owner-1', scope='admin')
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    resp = api_client.post('/api/automation/agent/register/', {
        'name': 'spawned-by-admin',
        'hostname': 'ci',
    }, format='json')
    assert resp.status_code == 201, resp.content
    assert 'api_key' in resp.json()


@pytest.mark.django_db
def test_unknown_bearer_token_falls_through(api_client):
    api_client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
    resp = api_client.get('/api/types/observations/')
    # Falls through to next authenticator (Supabase), which fails → 401.
    assert resp.status_code in (401, 403), resp.content


@pytest.mark.django_db
def test_jwt_shaped_token_is_skipped_by_agent_auth(api_client):
    # Tokens starting with eyJ are JWT-shaped — should not be hashed against
    # AgentRegistration. They go to SupabaseAuthentication instead.
    api_client.credentials(HTTP_AUTHORIZATION='Bearer eyJ.fake.jwt')
    resp = api_client.get('/api/types/observations/')
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_inactive_agent_token_does_not_authenticate(api_client):
    _, key = _make_agent('disabled-1', scope='admin', is_active=False)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    resp = api_client.get('/api/types/observations/')
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_last_seen_at_is_bumped_on_successful_auth(api_client):
    agent, key = _make_agent('heartbeat-1', scope='read_only')
    assert agent.last_seen_at is None
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    api_client.get('/api/types/observations/')
    agent.refresh_from_db()
    assert agent.last_seen_at is not None
    assert agent.last_seen_at > timezone.now() - timedelta(minutes=1)


@pytest.mark.django_db
def test_create_agent_management_command_mints_usable_token(api_client):
    out = io.StringIO()
    call_command(
        'create_agent', '--name', 'mgmt-cmd-test', '--scope', 'admin',
        '--json', stdout=out,
    )
    import json
    payload = json.loads(out.getvalue())
    assert payload['scope'] == 'admin'
    key = payload['api_key']
    assert key

    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {key}')
    resp = api_client.get('/api/types/observations/')
    assert resp.status_code == 200, resp.content
