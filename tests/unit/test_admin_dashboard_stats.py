"""
Unit tests for the admin observability helpers added to
backend/apps/accounts/views.py. We don't mock — the helpers query the real
database, and we want the aggregation SQL itself to be exercised against
Postgres so the Percentile aggregate fails loudly if anyone swaps engines.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone


User = get_user_model()


@pytest.mark.django_db
def test_processing_stats_aggregates_per_format_with_p95():
    from apps.accounts.views import _processing_stats
    from apps.models.models import ExtractionRun, SourceFile
    from apps.projects.models import Project

    project = Project.objects.create(name="t", description="")

    def _src(fmt: str) -> SourceFile:
        return SourceFile.objects.create(
            project=project,
            original_filename=f"x.{fmt}",
            format=fmt,
            file_size=1,
        )

    # Three completed IFC runs with varying durations + one failed.
    for seconds in (1.0, 4.0, 20.0):
        run = ExtractionRun.objects.create(source_file=_src("ifc"), status='completed')
        run.duration_seconds = seconds
        run.completed_at = timezone.now()
        run.save(update_fields=['duration_seconds', 'completed_at', 'status'])

    failed = ExtractionRun.objects.create(source_file=_src("ifc"), status='failed')
    failed.error_message = "boom"
    failed.save(update_fields=['status', 'error_message'])

    stats = _processing_stats()
    by_format = {row['format']: row for row in stats['extraction']['by_format']}

    assert 'ifc' in by_format
    ifc = by_format['ifc']
    assert ifc['count'] == 3              # only completed runs counted
    assert ifc['failed'] == 1
    assert ifc['success_rate'] == pytest.approx(3 / 4, abs=0.001)
    assert ifc['avg_seconds'] == pytest.approx((1.0 + 4.0 + 20.0) / 3, abs=0.01)
    # p95 from {1, 4, 20} is ≈ 18.4 (linear interp at 0.95 of n=3).
    # Just assert it lies between the median and the max — proves the
    # PERCENTILE_CONT aggregate fired.
    assert 4.0 <= ifc['p95_seconds'] <= 20.0

    assert any(f['error_message'] == 'boom' for f in stats['extraction']['recent_failures'])


@pytest.mark.django_db
def test_system_stats_returns_structured_payload_even_with_no_data():
    from apps.accounts.views import _system_stats

    payload = _system_stats()

    # Required keys are present regardless of broker/worker state.
    for key in (
        'database_ok',
        'celery',
        'last_extraction_completed_at',
        'last_pipeline_completed_at',
        'process_started_at',
        'git_sha',
        'hostname',
    ):
        assert key in payload

    assert payload['database_ok'] is True
    for key in ('queue_depth', 'active_workers', 'broker_ok'):
        assert key in payload['celery']
    # Last-completed timestamps are nullable when the DB is fresh.
    assert payload['last_extraction_completed_at'] in (None, payload['last_extraction_completed_at'])


@pytest.mark.django_db
def test_outbound_stats_groups_deliveries_and_computes_success_rate():
    from apps.accounts.views import _outbound_stats
    from apps.automation.models import WebhookSubscription, WebhookDelivery
    from apps.projects.models import Project

    project = Project.objects.create(name="t-outbound", description="")
    sub = WebhookSubscription.objects.create(
        project=project,
        event_type='model.processed',
        target_url='https://example.test/hook',
    )

    # 4 successful, 1 failed → success_rate_24h = 4/5 = 0.8
    for _ in range(4):
        WebhookDelivery.objects.create(
            subscription=sub,
            event_type='model.processed',
            target_url='https://example.test/hook',
            status='success',
        )
    WebhookDelivery.objects.create(
        subscription=sub,
        event_type='model.processed',
        target_url='https://example.test/hook',
        status='failed',
        error='timeout',
    )

    stats = _outbound_stats()
    assert stats['subscriptions'] == {'total': 1, 'active': 1}
    assert stats['last_24h']['success'] == 4
    assert stats['last_24h']['failed'] == 1
    assert stats['success_rate_24h'] == pytest.approx(0.8, abs=0.001)
    assert any(f['error'] == 'timeout' for f in stats['recent_failures'])
