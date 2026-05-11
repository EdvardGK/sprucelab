"""
Tests for ``?dry_run=true`` on POST /api/automation/webhook-subscriptions/.

Subscription registration is an agent-discoverable surface (advertised via
the capabilities manifest), so dry-run lets agents validate target URL +
event type + project scope without creating a phantom subscription.

The HMAC secret is one-shot by design — dry-run does NOT preview it.
"""
from __future__ import annotations

import json

import pytest

from apps.automation.models import WebhookSubscription
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='webhook-sub-dry-run-test')


def _payload(project, **overrides):
    body = {
        'project': str(project.id),
        'event_type': 'model.processed',
        'target_url': 'https://example.com/hook',
        'description': 'plan-then-execute test',
    }
    body.update(overrides)
    return body


def test_create_dry_run_does_not_persist(client, project):
    resp = client.post(
        '/api/automation/webhook-subscriptions/?dry_run=true',
        data=json.dumps(_payload(project)),
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body['dry_run'] is True
    assert body['would_create']['event_type'] == 'model.processed'
    assert body['would_create']['target_url'] == 'https://example.com/hook'
    assert body['would_create']['project'] == str(project.id)
    # Secret never previewed in dry-run — it's a one-shot value generated at
    # persist time.
    assert 'secret' not in body['would_create']
    assert 'note' in body

    assert WebhookSubscription.objects.count() == 0


def test_create_default_persists_and_returns_secret(client, project):
    resp = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_payload(project)),
        content_type='application/json',
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    # Default path returns the standard create envelope (with secret), not
    # the dry-run envelope.
    assert 'dry_run' not in body
    assert body['secret']
    assert len(body['secret']) >= 32
    assert WebhookSubscription.objects.count() == 1


def test_create_dry_run_invalid_input_returns_400(client, project):
    """
    Per feedback-bad-models-are-the-product, dry-run with invalid input
    surfaces validation errors as data (400 + field error shape), not a
    crash.
    """
    resp = client.post(
        '/api/automation/webhook-subscriptions/?dry_run=true',
        data=json.dumps(_payload(project, target_url='not-a-url')),
        content_type='application/json',
    )
    assert resp.status_code == 400
    assert 'target_url' in resp.json()
    assert WebhookSubscription.objects.count() == 0
