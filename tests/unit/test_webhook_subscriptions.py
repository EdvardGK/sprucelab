"""
CRUD tests for /api/automation/webhook-subscriptions/ + /webhook-deliveries/.

The plaintext ``secret`` is exposed exactly twice in the API: on create and
on rotate-secret. Detail/list reads must never include it. These tests pin
that contract along with project scoping, query filtering, and the
custom test/redeliver/deliveries actions.
"""
from __future__ import annotations

import json

import pytest

from apps.automation.models import WebhookDelivery, WebhookSubscription
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name="webhook-subs-test", description="pytest")


@pytest.fixture
def other_project(db):
    return Project.objects.create(name="other-project", description="pytest")


def _create_payload(project, event_type='model.processed', target_url='https://example.com/hook'):
    return {
        'project': str(project.id),
        'event_type': event_type,
        'target_url': target_url,
        'description': 'test sub',
    }


def test_create_returns_secret_once(client, project):
    resp = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project)),
        content_type='application/json',
    )
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body['secret']
    assert len(body['secret']) >= 32
    sub_id = body['id']

    detail = client.get(f'/api/automation/webhook-subscriptions/{sub_id}/').json()
    assert 'secret' not in detail


def test_list_does_not_leak_secret(client, project):
    client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project)),
        content_type='application/json',
    )
    body = client.get('/api/automation/webhook-subscriptions/').json()
    items = body if isinstance(body, list) else body.get('results', [])
    assert items, body
    for item in items:
        assert 'secret' not in item


def test_filter_by_project(client, project, other_project):
    client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project, target_url='https://a.example/hook')),
        content_type='application/json',
    )
    client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(other_project, target_url='https://b.example/hook')),
        content_type='application/json',
    )
    body = client.get(
        f'/api/automation/webhook-subscriptions/?project={project.id}'
    ).json()
    items = body if isinstance(body, list) else body.get('results', [])
    assert len(items) == 1
    assert items[0]['project'] == str(project.id)


def test_filter_by_event_type(client, project):
    client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project, event_type='model.processed')),
        content_type='application/json',
    )
    client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(
            project,
            event_type='claim.extracted',
            target_url='https://example.com/hook2',
        )),
        content_type='application/json',
    )
    body = client.get(
        '/api/automation/webhook-subscriptions/?event_type=claim.extracted'
    ).json()
    items = body if isinstance(body, list) else body.get('results', [])
    assert len(items) == 1
    assert items[0]['event_type'] == 'claim.extracted'


def test_unique_per_project_event_url(client, project):
    p = _create_payload(project)
    first = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(p), content_type='application/json',
    )
    assert first.status_code == 201
    second = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(p), content_type='application/json',
    )
    assert second.status_code in (400, 409)


def test_rotate_secret_returns_new_secret_once(client, project):
    create = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project)),
        content_type='application/json',
    ).json()
    original_secret = create['secret']
    sub_id = create['id']

    rotate = client.post(
        f'/api/automation/webhook-subscriptions/{sub_id}/rotate-secret/'
    ).json()
    assert rotate['secret']
    assert rotate['secret'] != original_secret

    detail = client.get(f'/api/automation/webhook-subscriptions/{sub_id}/').json()
    assert 'secret' not in detail

    sub = WebhookSubscription.objects.get(pk=sub_id)
    assert sub.secret == rotate['secret']


def test_test_action_queues_delivery(client, project, monkeypatch):
    create = client.post(
        '/api/automation/webhook-subscriptions/',
        data=json.dumps(_create_payload(project)),
        content_type='application/json',
    ).json()
    sub_id = create['id']

    # The view does ``from .tasks import deliver_webhook_task; deliver_webhook_task.delay(...)``
    # — patch ``.delay`` on the actual task object so the lazy import picks it up.
    queued: list[str] = []
    from apps.automation.tasks import deliver_webhook_task
    monkeypatch.setattr(
        deliver_webhook_task, 'delay',
        lambda delivery_id: queued.append(delivery_id),
    )

    resp = client.post(f'/api/automation/webhook-subscriptions/{sub_id}/test/')
    assert resp.status_code == 202, resp.content
    assert queued
    assert resp.json()['delivery_id'] == queued[0]

    delivery = WebhookDelivery.objects.get(pk=queued[0])
    assert delivery.event_type == 'webhook.test'
    assert str(delivery.subscription_id) == create['id']


def test_deliveries_action_returns_per_subscription_log(client, project):
    sub = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://example.com/hook',
    )
    other = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://other.example/hook',
    )
    WebhookDelivery.objects.create(
        subscription=sub, event_type='model.processed',
        target_url=sub.target_url, status='success',
    )
    WebhookDelivery.objects.create(
        subscription=other, event_type='model.processed',
        target_url=other.target_url, status='success',
    )
    body = client.get(
        f'/api/automation/webhook-subscriptions/{sub.id}/deliveries/'
    ).json()
    items = body if isinstance(body, list) else body.get('results', [])
    assert len(items) == 1
    assert items[0]['subscription'] == str(sub.id)


def test_delete_subscription_keeps_delivery_history(client, project):
    sub = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://example.com/hook',
    )
    delivery = WebhookDelivery.objects.create(
        subscription=sub, event_type='model.processed',
        target_url=sub.target_url, status='success',
    )
    resp = client.delete(f'/api/automation/webhook-subscriptions/{sub.id}/')
    assert resp.status_code in (204, 200)

    delivery.refresh_from_db()
    assert delivery.subscription_id is None
    assert delivery.event_type == 'model.processed'


def test_redeliver_creates_new_delivery_row(client, project, monkeypatch):
    sub = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://example.com/hook',
    )
    original = WebhookDelivery.objects.create(
        subscription=sub, event_type='model.processed',
        target_url=sub.target_url, status='failed',
        payload={'event': 'model.processed'},
    )
    queued: list[str] = []
    from apps.automation.tasks import deliver_webhook_task
    monkeypatch.setattr(
        deliver_webhook_task, 'delay',
        lambda delivery_id: queued.append(delivery_id),
    )

    resp = client.post(f'/api/automation/webhook-deliveries/{original.id}/redeliver/')
    assert resp.status_code == 202, resp.content
    body = resp.json()
    assert body['id'] != str(original.id)
    assert body['payload'] == {'event': 'model.processed'}
    assert queued and queued[0] == body['id']

    original.refresh_from_db()
    assert original.status == 'failed'
