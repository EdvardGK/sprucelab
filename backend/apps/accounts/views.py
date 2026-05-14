"""
Admin dashboard API views.

Staff-only endpoints for platform management:
  GET  /api/admin/dashboard/              — aggregated platform stats + user list
  POST /api/admin/users/{user_id}/approve/ — approve a pending user
  POST /api/admin/users/{user_id}/reject/  — reject a pending/approved user
"""

import logging
import socket

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Aggregate, Avg, Count, F, FloatField, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.accounts import STARTED_AT
from apps.accounts.models import UserProfile

logger = logging.getLogger(__name__)
User = get_user_model()


class Percentile(Aggregate):
    """
    PostgreSQL percentile_cont aggregate. Used to report p95 extraction
    durations per format. Sprucelab runs on Postgres in every environment
    (Supabase prod, Postgres in tests via the Justfile); no SQLite fallback.
    """
    function = 'PERCENTILE_CONT'
    name = 'percentile'
    output_field = FloatField()
    template = '%(function)s(%(percentile)s) WITHIN GROUP (ORDER BY %(expressions)s)'

    def __init__(self, expression, percentile=0.95, **extra):
        super().__init__(expression, percentile=percentile, **extra)


# Lazy imports to avoid circular imports at module load time.
def _get_project_model():
    from apps.projects.models import Project
    return Project

def _get_model_model():
    from apps.models.models import Model
    return Model

def _get_extraction_models():
    from apps.models.models import ExtractionRun, SourceFile
    return ExtractionRun, SourceFile

def _get_pipeline_models():
    from apps.automation.models import PipelineRun
    return PipelineRun

def _get_webhook_models():
    from apps.automation.models import WebhookSubscription, WebhookDelivery
    return WebhookSubscription, WebhookDelivery

def _get_type_models():
    from apps.entities.models import IFCType, TypeMapping
    return IFCType, TypeMapping


def _thirty_days_ago():
    return timezone.now() - timedelta(days=30)


def _twenty_four_hours_ago():
    return timezone.now() - timedelta(hours=24)


def _per_day_counts(queryset, date_field='created_at'):
    """
    Return a list of {"date": "YYYY-MM-DD", "count": N} dicts for the last 30
    days, with zeroes filled in for days with no activity.
    """
    thirty_ago = _thirty_days_ago()

    raw = (
        queryset
        .filter(**{f'{date_field}__gte': thirty_ago})
        .annotate(day=TruncDate(date_field))
        .values('day')
        .annotate(count=Count('id'))
        .order_by('day')
    )
    by_day = {row['day'].isoformat(): row['count'] for row in raw}

    today = timezone.now().date()
    result = []
    for offset in range(30):
        d = (today - timedelta(days=29 - offset)).isoformat()
        result.append({'date': d, 'count': by_day.get(d, 0)})
    return result


def _processing_stats():
    """
    Aggregate file-processing health across ExtractionRun + PipelineRun.

    Per-format breakdown (count / success rate / avg / p95) lets the owner
    see "are IFCs slow? are point clouds failing?" at a glance. The recent-
    failures feed is keyed to the canonical failed-status terms each table
    uses ('failed' for both — verified against the STATUS_CHOICES defs).
    """
    ExtractionRun, SourceFile = _get_extraction_models()
    PipelineRun = _get_pipeline_models()

    day_ago = _twenty_four_hours_ago()

    completed_runs = ExtractionRun.objects.filter(
        status='completed', duration_seconds__isnull=False,
    )
    by_format_qs = (
        completed_runs
        .annotate(fmt=F('source_file__format'))
        .values('fmt')
        .annotate(
            count=Count('id'),
            avg_seconds=Avg('duration_seconds'),
            p95_seconds=Percentile('duration_seconds', percentile=0.95),
        )
        .order_by('-count')
    )
    failure_counts = dict(
        ExtractionRun.objects.filter(status='failed')
        .annotate(fmt=F('source_file__format'))
        .values_list('fmt')
        .annotate(n=Count('id'))
        .values_list('fmt', 'n')
    )
    by_format = []
    for row in by_format_qs:
        fmt = row['fmt'] or 'unknown'
        completed = row['count']
        failed = failure_counts.get(fmt, 0)
        total = completed + failed
        by_format.append({
            'format': fmt,
            'count': completed,
            'failed': failed,
            'success_rate': round(completed / total, 3) if total else None,
            'avg_seconds': round(row['avg_seconds'] or 0.0, 2),
            'p95_seconds': round(row['p95_seconds'] or 0.0, 2),
        })

    extraction_24h_raw = dict(
        ExtractionRun.objects.filter(started_at__gte=day_ago)
        .values_list('status').annotate(n=Count('id'))
        .values_list('status', 'n')
    )
    extraction_24h = {
        'completed': extraction_24h_raw.get('completed', 0),
        'failed': extraction_24h_raw.get('failed', 0),
        'running': extraction_24h_raw.get('running', 0),
        'pending': extraction_24h_raw.get('pending', 0),
    }

    recent_extraction_failures = [
        {
            'id': str(run.id),
            'kind': 'extraction',
            'format': run.source_file.format if run.source_file_id else None,
            'filename': run.source_file.original_filename if run.source_file_id else None,
            'started_at': run.started_at.isoformat() if run.started_at else None,
            'error_message': (run.error_message or '')[:500],
        }
        for run in (
            ExtractionRun.objects.filter(status='failed')
            .select_related('source_file')
            .order_by('-started_at')[:10]
        )
    ]

    # ── Pipeline runs ─────────────────────────────────────────────────────
    pipeline_24h_raw = dict(
        PipelineRun.objects.filter(created_at__gte=day_ago)
        .values_list('status').annotate(n=Count('id'))
        .values_list('status', 'n')
    )
    pipeline_24h = {
        'success': pipeline_24h_raw.get('success', 0),
        'failed': pipeline_24h_raw.get('failed', 0),
        'partial': pipeline_24h_raw.get('partial', 0),
        'running': pipeline_24h_raw.get('running', 0),
        'queued': pipeline_24h_raw.get('queued', 0),
    }
    pipeline_avg_ms = (
        PipelineRun.objects.filter(status='success', duration_ms__isnull=False)
        .aggregate(v=Avg('duration_ms'))['v']
    )
    recent_pipeline_failures = [
        {
            'id': str(run.id),
            'kind': 'pipeline',
            'pipeline': run.pipeline.name if run.pipeline_id else None,
            'started_at': run.started_at.isoformat() if run.started_at else None,
            'error_message': (run.error_message or '')[:500],
        }
        for run in (
            PipelineRun.objects.filter(status='failed')
            .select_related('pipeline')
            .order_by('-created_at')[:10]
        )
    ]

    return {
        'extraction': {
            'by_format': by_format,
            'last_24h': extraction_24h,
            'recent_failures': recent_extraction_failures,
        },
        'pipelines': {
            'last_24h': pipeline_24h,
            'avg_duration_ms': round(pipeline_avg_ms, 2) if pipeline_avg_ms else None,
            'recent_failures': recent_pipeline_failures,
        },
    }


def _system_stats():
    """
    Live system introspection. No new state — every value is computed at
    request time. Each subprobe fails soft and reports null rather than
    raising, so a broken Redis won't take the entire admin page down.
    """
    # Database — reuse the pattern from config.views.health_check.
    database_ok = True
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
            cur.fetchone()
    except Exception as exc:  # pragma: no cover — failure surfaces in panel
        logger.warning('admin system probe: database failed: %s', exc)
        database_ok = False

    # Celery broker — Redis LLEN on the default 'celery' queue. We construct
    # the client manually with a short socket timeout so a wedged broker
    # can't hang the request.
    queue_depth = None
    broker_ok = False
    try:
        import redis  # type: ignore
        client = redis.Redis.from_url(
            settings.CELERY_BROKER_URL,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        queue_depth = client.llen('celery')
        broker_ok = True
    except Exception as exc:
        logger.warning('admin system probe: redis failed: %s', exc)

    # Active workers — Celery control.inspect. Network round-trip; short
    # timeout to keep the page snappy when no workers are connected.
    active_workers = None
    try:
        from config.celery import app as celery_app
        active = celery_app.control.inspect(timeout=0.5).active_queues()
        active_workers = len(active or {})
    except Exception as exc:
        logger.warning('admin system probe: celery inspect failed: %s', exc)

    # Last-completed timestamps — "the data foundation is alive" pulse.
    ExtractionRun, _ = _get_extraction_models()
    PipelineRun = _get_pipeline_models()
    last_ext = (
        ExtractionRun.objects.filter(status='completed', completed_at__isnull=False)
        .order_by('-completed_at').values_list('completed_at', flat=True).first()
    )
    last_pipe = (
        PipelineRun.objects.filter(status='success', completed_at__isnull=False)
        .order_by('-completed_at').values_list('completed_at', flat=True).first()
    )

    return {
        'database_ok': database_ok,
        'celery': {
            'queue_depth': queue_depth,
            'active_workers': active_workers,
            'broker_ok': broker_ok,
        },
        'last_extraction_completed_at': last_ext.isoformat() if last_ext else None,
        'last_pipeline_completed_at': last_pipe.isoformat() if last_pipe else None,
        'process_started_at': STARTED_AT.isoformat(),
        'git_sha': getattr(settings, 'GIT_SHA', 'dev'),
        'hostname': socket.gethostname(),
    }


def _outbound_stats():
    """
    Webhook delivery health. Owners need to know "are events going out and
    landing" before customers report missed integrations.
    """
    WebhookSubscription, WebhookDelivery = _get_webhook_models()
    day_ago = _twenty_four_hours_ago()

    sub_total = WebhookSubscription.objects.count()
    sub_active = WebhookSubscription.objects.filter(is_active=True).count()

    delivery_24h_raw = dict(
        WebhookDelivery.objects.filter(created_at__gte=day_ago)
        .values_list('status').annotate(n=Count('id'))
        .values_list('status', 'n')
    )
    delivery_24h = {
        'success': delivery_24h_raw.get('success', 0),
        'failed': delivery_24h_raw.get('failed', 0),
        'retrying': delivery_24h_raw.get('retrying', 0),
        'pending': delivery_24h_raw.get('pending', 0),
        'delivering': delivery_24h_raw.get('delivering', 0),
    }
    delivered = delivery_24h['success']
    attempted = delivered + delivery_24h['failed']
    success_rate = round(delivered / attempted, 3) if attempted else None

    recent_failures = [
        {
            'id': str(d.id),
            'event_type': d.event_type,
            'target_url': d.target_url,
            'status': d.status,
            'response_status_code': d.response_status_code,
            'last_attempt_at': d.last_attempt_at.isoformat() if d.last_attempt_at else None,
            'error': (d.error or '')[:500],
        }
        for d in (
            WebhookDelivery.objects.filter(status='failed')
            .order_by('-created_at')[:10]
        )
    ]

    return {
        'subscriptions': {'total': sub_total, 'active': sub_active},
        'last_24h': delivery_24h,
        'success_rate_24h': success_rate,
        'recent_failures': recent_failures,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_dashboard(request):
    """
    Aggregated platform statistics for the admin dashboard.
    """
    thirty_ago = _thirty_days_ago()

    # ── Users ─────────────────────────────────────────────────────────────────
    profile_qs = UserProfile.objects.all()
    status_counts = dict(
        profile_qs.values_list('approval_status')
        .annotate(n=Count('id'))
        .values_list('approval_status', 'n')
    )
    total_users = sum(status_counts.values())
    recent_signups = _per_day_counts(profile_qs, date_field='created_at')

    users_list = []
    for profile in (
        profile_qs
        .select_related('user')
        .order_by('-created_at')
    ):
        meta = profile.signup_metadata or {}
        users_list.append({
            'id': profile.user.id,
            'email': profile.user.email,
            'display_name': profile.display_name,
            'approval_status': profile.approval_status,
            'created_at': profile.created_at,
            'company_name': meta.get('company_name', ''),
            'role': meta.get('role', ''),
        })

    # ── Projects ──────────────────────────────────────────────────────────────
    Project = _get_project_model()
    project_qs = Project.objects.all()
    total_projects = project_qs.count()
    recent_projects = project_qs.filter(created_at__gte=thirty_ago).count()

    # ── Models ────────────────────────────────────────────────────────────────
    IFCModel = _get_model_model()
    model_qs = IFCModel.objects.all()

    model_agg = model_qs.aggregate(
        total=Count('id'),
        total_size=Sum('file_size'),
    )
    total_models = model_agg['total'] or 0
    total_size_bytes = model_agg['total_size'] or 0

    # by_status — bucket into the four primary statuses
    raw_status = dict(
        model_qs.values_list('status')
        .annotate(n=Count('id'))
        .values_list('status', 'n')
    )
    by_status = {
        'ready': raw_status.get('ready', 0),
        'processing': raw_status.get('processing', 0),
        'error': raw_status.get('error', 0),
        'uploading': raw_status.get('uploading', 0),
    }

    recent_uploads = _per_day_counts(model_qs, date_field='created_at')

    raw_discipline = dict(
        model_qs.exclude(discipline__isnull=True).exclude(discipline='')
        .values_list('discipline')
        .annotate(n=Count('id'))
        .values_list('discipline', 'n')
    )

    # ── Types ─────────────────────────────────────────────────────────────────
    IFCType, TypeMapping = _get_type_models()
    total_types = TypeMapping.objects.count()
    total_mapped = TypeMapping.objects.exclude(mapping_status='pending').count()
    mapping_rate = round(total_mapped / total_types * 100, 1) if total_types else 0.0

    return Response({
        'users': {
            'total': total_users,
            'approved': status_counts.get(UserProfile.APPROVAL_APPROVED, 0),
            'pending': status_counts.get(UserProfile.APPROVAL_PENDING, 0),
            'rejected': status_counts.get(UserProfile.APPROVAL_REJECTED, 0),
            'recent_signups': recent_signups,
        },
        'projects': {
            'total': total_projects,
            'recent': recent_projects,
        },
        'models': {
            'total': total_models,
            'total_size_bytes': total_size_bytes,
            'by_status': by_status,
            'recent_uploads': recent_uploads,
            'by_discipline': raw_discipline,
        },
        'types': {
            'total_types': total_types,
            'total_mapped': total_mapped,
            'mapping_rate': mapping_rate,
        },
        'users_list': users_list,
        'processing': _processing_stats(),
        'system': _system_stats(),
        'outbound': _outbound_stats(),
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_approve_user(request, user_id):
    """
    Approve a user account. Sets approval_status='approved', records approved_by
    and approved_at.
    """
    try:
        profile = UserProfile.objects.select_related('user').get(user_id=user_id)
    except UserProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    profile.approval_status = UserProfile.APPROVAL_APPROVED
    profile.approved_at = timezone.now()
    profile.approved_by = request.user
    profile.save(update_fields=['approval_status', 'approved_at', 'approved_by', 'updated_at'])

    return Response({
        'id': profile.user.id,
        'email': profile.user.email,
        'approval_status': profile.approval_status,
        'approved_at': profile.approved_at,
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_reject_user(request, user_id):
    """
    Reject a user account. Sets approval_status='rejected', clears approved_at
    and approved_by.
    """
    try:
        profile = UserProfile.objects.select_related('user').get(user_id=user_id)
    except UserProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    profile.approval_status = UserProfile.APPROVAL_REJECTED
    profile.approved_at = None
    profile.approved_by = None
    profile.save(update_fields=['approval_status', 'approved_at', 'approved_by', 'updated_at'])

    return Response({
        'id': profile.user.id,
        'email': profile.user.email,
        'approval_status': profile.approval_status,
    })
