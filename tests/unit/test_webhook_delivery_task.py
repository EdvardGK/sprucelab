"""
Tests for ``apps.automation.tasks.deliver_webhook_task``.

The task signs the body, POSTs to the subscriber, retries with exponential
backoff on failures, and after exhausting retries records ``failed`` and
increments ``consecutive_failures`` (auto-disables the subscription if the
threshold is crossed).

These tests run the task directly (no Celery broker) and stub out
``requests.post`` so they're hermetic.
"""
from __future__ import annotations

import json

import pytest
import requests
from celery.exceptions import Retry

from apps.automation.models import WebhookDelivery, WebhookSubscription
from apps.automation.services.webhook_dispatcher import sign_payload
from apps.automation.tasks import deliver_webhook_task
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='delivery-test', description='pytest')


@pytest.fixture
def subscription(project):
    sub = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://example.com/hook',
    )
    return sub


def _make_delivery(subscription, payload=None):
    return WebhookDelivery.objects.create(
        subscription=subscription,
        event_type=subscription.event_type,
        target_url=subscription.target_url,
        payload=payload or {'event': 'model.processed', 'k': 'v'},
        status='pending',
    )


class _Response:
    def __init__(self, status_code, text=''):
        self.status_code = status_code
        self.text = text


def test_success_marks_delivery_success(monkeypatch, subscription):
    delivery = _make_delivery(subscription)
    captured = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        captured['url'] = url
        captured['data'] = data
        captured['headers'] = headers
        return _Response(200, '{"ok": true}')

    monkeypatch.setattr(requests, 'post', fake_post)
    deliver_webhook_task.run(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == 'success'
    assert delivery.attempt_count == 1
    assert delivery.response_status_code == 200
    assert delivery.completed_at is not None

    subscription.refresh_from_db()
    assert subscription.consecutive_failures == 0
    assert subscription.last_fired_at is not None

    # Signature header validates against stored secret + sent body
    sig_header = captured['headers']['X-Webhook-Signature']
    timestamp = captured['headers']['X-Webhook-Timestamp']
    expected = sign_payload(subscription.secret, captured['data'], timestamp)
    assert sig_header == expected
    assert captured['headers']['X-Webhook-Event'] == 'model.processed'
    assert captured['headers']['X-Webhook-Delivery-Id'] == str(delivery.id)


def test_canonical_body_sort_keys(monkeypatch, subscription):
    delivery = _make_delivery(
        subscription,
        payload={'b': 2, 'a': 1, 'nested': {'z': 9, 'm': 7}},
    )
    captured = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        captured['data'] = data
        return _Response(200, '')

    monkeypatch.setattr(requests, 'post', fake_post)
    deliver_webhook_task.run(str(delivery.id))

    body = json.loads(captured['data'])
    # sort_keys=True means deterministic ordering on the wire
    assert list(body.keys()) == ['a', 'b', 'nested']
    assert list(body['nested'].keys()) == ['m', 'z']


def test_4xx_retries_until_max(monkeypatch, subscription):
    delivery = _make_delivery(subscription)
    monkeypatch.setattr(
        requests, 'post',
        lambda *a, **kw: _Response(404, 'not found'),
    )
    # Run once: should call self.retry() — celery raises Retry for that.
    with pytest.raises(Retry):
        deliver_webhook_task.run(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == 'retrying'
    assert delivery.response_status_code == 404
    assert delivery.attempt_count == 1


def test_5xx_retries(monkeypatch, subscription):
    delivery = _make_delivery(subscription)
    monkeypatch.setattr(
        requests, 'post',
        lambda *a, **kw: _Response(503, 'unavailable'),
    )
    with pytest.raises(Retry):
        deliver_webhook_task.run(str(delivery.id))
    delivery.refresh_from_db()
    assert delivery.status == 'retrying'


def test_request_exception_retries(monkeypatch, subscription):
    delivery = _make_delivery(subscription)

    def boom(*a, **kw):
        raise requests.ConnectionError('refused')
    monkeypatch.setattr(requests, 'post', boom)
    with pytest.raises(Retry):
        deliver_webhook_task.run(str(delivery.id))
    delivery.refresh_from_db()
    assert delivery.status == 'retrying'
    assert 'request error' in delivery.error


def test_failure_after_max_retries_finalizes(monkeypatch, subscription):
    delivery = _make_delivery(subscription)
    monkeypatch.setattr(
        requests, 'post',
        lambda *a, **kw: _Response(500, 'boom'),
    )

    # Simulate task at last retry: monkeypatch self.request.retries via a
    # higher-level apply with retries=99 on the celery request stack.
    deliver_webhook_task.push_request(retries=99)
    try:
        deliver_webhook_task.run(str(delivery.id))
    finally:
        deliver_webhook_task.pop_request()

    delivery.refresh_from_db()
    assert delivery.status == 'failed'
    assert delivery.completed_at is not None
    assert delivery.response_status_code == 500

    subscription.refresh_from_db()
    assert subscription.consecutive_failures == 1


def test_response_body_truncates(monkeypatch, subscription, settings):
    settings.WEBHOOK_RESPONSE_BODY_TRUNCATE_BYTES = 16
    delivery = _make_delivery(subscription)
    monkeypatch.setattr(
        requests, 'post',
        lambda *a, **kw: _Response(200, 'X' * 100),
    )
    deliver_webhook_task.run(str(delivery.id))
    delivery.refresh_from_db()
    assert len(delivery.response_body) == 16


def test_auto_disables_after_threshold(monkeypatch, subscription, settings):
    settings.WEBHOOK_AUTO_DISABLE_THRESHOLD = 3
    monkeypatch.setattr(
        requests, 'post',
        lambda *a, **kw: _Response(500, 'boom'),
    )
    # Three failed final attempts pushes consecutive_failures to 3.
    for _ in range(3):
        delivery = _make_delivery(subscription)
        deliver_webhook_task.push_request(retries=99)
        try:
            deliver_webhook_task.run(str(delivery.id))
        finally:
            deliver_webhook_task.pop_request()

    subscription.refresh_from_db()
    assert subscription.consecutive_failures == 3
    assert subscription.is_active is False


def test_inactive_subscription_marks_failed_without_post(monkeypatch, subscription):
    subscription.is_active = False
    subscription.save(update_fields=['is_active'])
    delivery = _make_delivery(subscription)

    called = {'count': 0}
    def fake_post(*a, **kw):
        called['count'] += 1
        return _Response(200, '')
    monkeypatch.setattr(requests, 'post', fake_post)

    deliver_webhook_task.run(str(delivery.id))
    delivery.refresh_from_db()
    assert delivery.status == 'failed'
    assert called['count'] == 0
    assert 'inactive' in delivery.error
