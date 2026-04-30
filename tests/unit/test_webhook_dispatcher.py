"""
Unit tests for ``apps.automation.services.webhook_dispatcher``.

The dispatcher must:
- be deterministic on signing
- find subscriptions by (event_type, project, is_active=True), including
  cross-project subscriptions (project=null) when called with a project_id
- create exactly one ``WebhookDelivery`` row per matched subscription
- queue Celery tasks via ``transaction.on_commit`` (no orphan tasks if a
  test rolls back)
- never raise to the caller (a dispatcher bug must not break extraction)
"""
from __future__ import annotations

import pytest

from apps.automation.models import WebhookDelivery, WebhookSubscription
from apps.automation.services.webhook_dispatcher import dispatch_event, sign_payload
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name="dispatcher-test", description="pytest")


@pytest.fixture
def other_project(db):
    return Project.objects.create(name="dispatcher-other", description="pytest")


@pytest.fixture
def fire_on_commit(monkeypatch):
    """
    pytest-django wraps each test in a transaction that's rolled back at
    the end, so ``transaction.on_commit`` callbacks queued by the dispatcher
    never fire by default. Patch on_commit to invoke the callback inline so
    we can assert that Celery tasks would have been queued.
    """
    import apps.automation.services.webhook_dispatcher as wd
    monkeypatch.setattr(
        wd.transaction, 'on_commit', lambda fn: fn(),
    )


# ---------------------------------------------------------------------------
# sign_payload
# ---------------------------------------------------------------------------

def test_sign_payload_is_deterministic():
    sig1 = sign_payload('s3cret', b'{"a":1}', '2026-01-01T00:00:00+00:00')
    sig2 = sign_payload('s3cret', b'{"a":1}', '2026-01-01T00:00:00+00:00')
    assert sig1 == sig2
    assert sig1.startswith('sha256=')


def test_sign_payload_changes_with_secret():
    a = sign_payload('one', b'{}', '2026-01-01T00:00:00+00:00')
    b = sign_payload('two', b'{}', '2026-01-01T00:00:00+00:00')
    assert a != b


def test_sign_payload_changes_with_body():
    a = sign_payload('s3cret', b'{"a":1}', '2026-01-01T00:00:00+00:00')
    b = sign_payload('s3cret', b'{"a":2}', '2026-01-01T00:00:00+00:00')
    assert a != b


def test_sign_payload_changes_with_timestamp():
    a = sign_payload('s3cret', b'{}', '2026-01-01T00:00:00+00:00')
    b = sign_payload('s3cret', b'{}', '2026-01-01T00:00:01+00:00')
    assert a != b


# ---------------------------------------------------------------------------
# dispatch_event
# ---------------------------------------------------------------------------

def test_dispatch_creates_delivery_per_matching_subscription(project, monkeypatch, fire_on_commit):
    sub_a = WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://a.example/hook',
    )
    sub_b = WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://b.example/hook',
    )
    queued: list[str] = []
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: queued.append(delivery_id),
    )

    delivery_ids = dispatch_event(
        'model.processed',
        {'event': 'model.processed'},
        project_id=str(project.id),
    )
    assert len(delivery_ids) == 2
    assert WebhookDelivery.objects.count() == 2
    assert {str(d) for d in delivery_ids} == {str(d) for d in queued}
    targets = set(WebhookDelivery.objects.values_list('target_url', flat=True))
    assert targets == {sub_a.target_url, sub_b.target_url}


def test_dispatch_includes_cross_project_subscriptions(project, other_project, monkeypatch):
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: None,
    )
    WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://scoped.example/hook',
    )
    WebhookSubscription.objects.create(
        project=None, event_type='model.processed',
        target_url='https://firehose.example/hook',
    )
    WebhookSubscription.objects.create(
        project=other_project, event_type='model.processed',
        target_url='https://other.example/hook',
    )
    delivery_ids = dispatch_event(
        'model.processed', {'event': 'model.processed'},
        project_id=str(project.id),
    )
    assert len(delivery_ids) == 2  # scoped + firehose
    targets = set(WebhookDelivery.objects.values_list('target_url', flat=True))
    assert 'https://other.example/hook' not in targets


def test_dispatch_skips_inactive_subscriptions(project, monkeypatch):
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: None,
    )
    WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://active.example/hook',
    )
    WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://inactive.example/hook',
        is_active=False,
    )
    delivery_ids = dispatch_event(
        'model.processed', {'event': 'model.processed'},
        project_id=str(project.id),
    )
    assert len(delivery_ids) == 1


def test_dispatch_skips_non_matching_event_types(project, monkeypatch):
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: None,
    )
    WebhookSubscription.objects.create(
        project=project, event_type='claim.extracted',
        target_url='https://example.com/hook',
    )
    delivery_ids = dispatch_event(
        'model.processed', {'event': 'model.processed'},
        project_id=str(project.id),
    )
    assert delivery_ids == []
    assert WebhookDelivery.objects.count() == 0


def test_dispatch_returns_empty_when_no_subscriptions(project, monkeypatch):
    queued: list[str] = []
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: queued.append(delivery_id),
    )
    delivery_ids = dispatch_event(
        'model.processed', {'event': 'model.processed'},
        project_id=str(project.id),
    )
    assert delivery_ids == []
    assert queued == []


def test_dispatch_swallows_queue_errors(project, monkeypatch, fire_on_commit):
    """If the Celery broker is down (.delay raises), the dispatcher must
    still return the delivery ids and never propagate to the caller —
    extraction code must not break because a webhook can't be queued."""
    def boom(delivery_id):
        raise RuntimeError('broker down')
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay', boom,
    )
    WebhookSubscription.objects.create(
        project=project, event_type='model.processed',
        target_url='https://example.com/hook',
    )
    delivery_ids = dispatch_event(
        'model.processed', {'event': 'model.processed'},
        project_id=str(project.id),
    )
    # Delivery row was created even though queueing failed.
    assert len(delivery_ids) == 1
    assert WebhookDelivery.objects.count() == 1


def test_dispatch_with_null_project_id_only_matches_firehose(project, monkeypatch):
    monkeypatch.setattr(
        'apps.automation.tasks.deliver_webhook_task.delay',
        lambda delivery_id: None,
    )
    WebhookSubscription.objects.create(
        project=project, event_type='verification.complete',
        target_url='https://scoped.example/hook',
    )
    WebhookSubscription.objects.create(
        project=None, event_type='verification.complete',
        target_url='https://firehose.example/hook',
    )
    delivery_ids = dispatch_event(
        'verification.complete', {'event': 'verification.complete'},
        project_id=None,
    )
    assert len(delivery_ids) == 1
    delivery = WebhookDelivery.objects.get(pk=delivery_ids[0])
    assert delivery.target_url == 'https://firehose.example/hook'
