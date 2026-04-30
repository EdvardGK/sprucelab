"""
Celery tasks for the automation app.

``deliver_webhook_task`` performs the actual HMAC-signed POST. Created by
``apps.automation.services.webhook_dispatcher.dispatch_event``; queued via
``transaction.on_commit`` so it never runs against an unpersisted delivery row.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone as dj_timezone

from .services.webhook_dispatcher import sign_payload

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='apps.automation.tasks.deliver_webhook_task')
def deliver_webhook_task(self, delivery_id: str):
    """
    Deliver a webhook payload to the subscriber URL with HMAC-SHA256 signing.

    On 2xx → status='success'. On other status / timeout / network error →
    retry with exponential backoff up to ``WEBHOOK_MAX_DELIVERY_RETRIES``
    times. After max retries, status='failed' and the subscription's
    ``consecutive_failures`` is incremented; if it crosses the auto-disable
    threshold, the subscription is deactivated (loud failure).

    Receivers MUST verify the signature against the stored secret. The
    canonical message is ``f"{X-Webhook-Timestamp}.{raw_body}"``.
    """
    from .models import WebhookDelivery, WebhookSubscription

    try:
        delivery = WebhookDelivery.objects.select_related('subscription').get(id=delivery_id)
    except WebhookDelivery.DoesNotExist:
        logger.warning('deliver_webhook_task: delivery %s missing, skipping', delivery_id)
        return {'status': 'skipped', 'reason': 'delivery_missing'}

    subscription = delivery.subscription
    if subscription is None:
        delivery.status = 'failed'
        delivery.error = 'subscription deleted before delivery'
        delivery.completed_at = dj_timezone.now()
        delivery.save(update_fields=['status', 'error', 'completed_at'])
        return {'status': 'failed', 'reason': 'subscription_missing'}

    if not subscription.is_active:
        delivery.status = 'failed'
        delivery.error = 'subscription inactive at delivery time'
        delivery.completed_at = dj_timezone.now()
        delivery.save(update_fields=['status', 'error', 'completed_at'])
        return {'status': 'failed', 'reason': 'subscription_inactive'}

    body = json.dumps(delivery.payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
    timestamp = datetime.now(timezone.utc).isoformat()
    signature = sign_payload(subscription.secret, body, timestamp)

    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'sprucelab-webhooks/1.0',
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Delivery-Id': str(delivery.id),
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-Signature': signature,
    }

    delivery.attempt_count += 1
    delivery.last_attempt_at = dj_timezone.now()
    delivery.status = 'delivering'
    delivery.save(update_fields=['attempt_count', 'last_attempt_at', 'status'])

    timeout = getattr(settings, 'WEBHOOK_REQUEST_TIMEOUT_SECONDS', 15)
    truncate_bytes = getattr(settings, 'WEBHOOK_RESPONSE_BODY_TRUNCATE_BYTES', 4096)
    max_retries = getattr(settings, 'WEBHOOK_MAX_DELIVERY_RETRIES', 3)
    auto_disable_threshold = getattr(settings, 'WEBHOOK_AUTO_DISABLE_THRESHOLD', 20)

    try:
        response = requests.post(
            delivery.target_url,
            data=body,
            headers=headers,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return _handle_failure(
            self, delivery, subscription,
            error=f'request error: {exc}',
            response_status=None,
            response_body='',
            max_retries=max_retries,
            auto_disable_threshold=auto_disable_threshold,
        )

    response_body = (response.text or '')[:truncate_bytes]

    if 200 <= response.status_code < 300:
        delivery.status = 'success'
        delivery.response_status_code = response.status_code
        delivery.response_body = response_body
        delivery.error = ''
        delivery.completed_at = dj_timezone.now()
        delivery.save(update_fields=[
            'status', 'response_status_code', 'response_body',
            'error', 'completed_at',
        ])
        WebhookSubscription.objects.filter(pk=subscription.pk).update(
            last_fired_at=dj_timezone.now(),
            consecutive_failures=0,
        )
        return {'status': 'success', 'response_status_code': response.status_code}

    return _handle_failure(
        self, delivery, subscription,
        error=f'non-2xx response: {response.status_code}',
        response_status=response.status_code,
        response_body=response_body,
        max_retries=max_retries,
        auto_disable_threshold=auto_disable_threshold,
    )


def _handle_failure(
    task,
    delivery,
    subscription,
    *,
    error: str,
    response_status: int | None,
    response_body: str,
    max_retries: int,
    auto_disable_threshold: int,
):
    """Common failure path: increment counters, retry or finalize."""
    from .models import WebhookSubscription

    delivery.response_status_code = response_status
    delivery.response_body = response_body
    delivery.error = error

    if task.request.retries < max_retries:
        delivery.status = 'retrying'
        delivery.save(update_fields=[
            'response_status_code', 'response_body', 'error', 'status',
        ])
        countdown = 60 * (2 ** task.request.retries)
        raise task.retry(countdown=countdown)

    delivery.status = 'failed'
    delivery.completed_at = dj_timezone.now()
    delivery.save(update_fields=[
        'response_status_code', 'response_body', 'error',
        'status', 'completed_at',
    ])

    new_count = (subscription.consecutive_failures or 0) + 1
    update_fields = {'consecutive_failures': new_count}
    if new_count >= auto_disable_threshold:
        update_fields['is_active'] = False
        logger.warning(
            'auto-disabling subscription %s after %d consecutive failures',
            subscription.pk, new_count,
        )
    WebhookSubscription.objects.filter(pk=subscription.pk).update(**update_fields)

    return {'status': 'failed', 'error': error}
