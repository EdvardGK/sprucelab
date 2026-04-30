"""
Webhook event dispatcher.

``dispatch_event`` is the single entrypoint extraction code, the verification
engine, and any future producer call when a notable event happens. It fans the
event out to every active subscription that matches the event name + project,
records a ``WebhookDelivery`` row per subscription, and queues the Celery task
that does the actual signed POST.

Design rules:
- Never raise to the caller. A dispatcher failure must not break the
  extraction or verification flow that triggered the event.
- Use ``transaction.on_commit`` so we never queue a task for a delivery row
  that didn't actually persist (matters for tests that wrap each test in a
  transaction, and for failed extraction flows that roll back).
- Cross-project subscriptions (project=null) get every event with a known
  project too — they're the firehose subscription form.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)


SIGNATURE_PREFIX = 'sha256='


def sign_payload(secret: str, body: bytes, timestamp: str) -> str:
    """
    Compute the canonical HMAC signature for a webhook delivery.

    Signs ``f"{timestamp}.{body}"`` so receivers can reject replays by
    rejecting timestamps outside a tolerance window. Returns the value to
    place verbatim in the ``X-Webhook-Signature`` header.
    """
    if isinstance(body, str):
        body = body.encode('utf-8')
    msg = timestamp.encode('utf-8') + b'.' + body
    digest = hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()
    return f"{SIGNATURE_PREFIX}{digest}"


def dispatch_event(
    event_type: str,
    payload: dict[str, Any],
    project_id: str | None = None,
) -> list[uuid.UUID]:
    """
    Fan out an event to matching subscriptions.

    Returns the list of ``WebhookDelivery`` ids queued. Empty list means no
    subscription matched (or dispatch failed — the event_type and any error
    are logged either way).
    """
    try:
        from apps.automation.models import WebhookSubscription, WebhookDelivery
        from apps.automation.tasks import deliver_webhook_task
    except Exception:
        logger.exception('webhook dispatcher import failed for %s', event_type)
        return []

    try:
        qs = WebhookSubscription.objects.filter(
            event_type=event_type,
            is_active=True,
        )
        if project_id is not None:
            qs = qs.filter(_project_match(project_id))
        else:
            qs = qs.filter(project__isnull=True)

        subscriptions = list(qs.only('id', 'target_url'))
        if not subscriptions:
            return []

        deliveries: list[WebhookDelivery] = []
        with transaction.atomic():
            for sub in subscriptions:
                deliveries.append(
                    WebhookDelivery.objects.create(
                        subscription=sub,
                        event_type=event_type,
                        payload=payload,
                        target_url=sub.target_url,
                        status='pending',
                    )
                )

        delivery_ids = [d.id for d in deliveries]

        def _queue() -> None:
            for did in delivery_ids:
                try:
                    deliver_webhook_task.delay(str(did))
                except Exception:
                    logger.exception('failed to queue webhook delivery %s', did)

        transaction.on_commit(_queue)
        return delivery_ids
    except Exception:
        logger.exception('dispatch_event(%s) failed', event_type)
        return []


def _project_match(project_id: str):
    """Q expression: match subscriptions for ``project_id`` OR null project."""
    from django.db.models import Q
    return Q(project_id=project_id) | Q(project__isnull=True)
