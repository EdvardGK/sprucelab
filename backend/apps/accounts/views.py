"""
Admin dashboard API views.

Staff-only endpoints for platform management:
  GET  /api/admin/dashboard/              — aggregated platform stats + user list
  POST /api/admin/users/{user_id}/approve/ — approve a pending user
  POST /api/admin/users/{user_id}/reject/  — reject a pending/approved user
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.accounts.models import UserProfile

User = get_user_model()

# Lazy imports to avoid circular imports at module load time.
def _get_project_model():
    from apps.projects.models import Project
    return Project

def _get_model_model():
    from apps.models.models import Model
    return Model

def _get_type_models():
    from apps.entities.models import IFCType, TypeMapping
    return IFCType, TypeMapping


def _thirty_days_ago():
    return timezone.now() - timedelta(days=30)


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
