from django.contrib import admin, messages
from django.utils import timezone

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'display_name',
        'approval_status',
        'company_name',
        'created_at',
        'approved_at',
    )
    list_filter = ('approval_status', 'created_at')
    search_fields = (
        'user__email',
        'user__username',
        'display_name',
        'signup_metadata',
    )
    readonly_fields = (
        'supabase_id',
        'created_at',
        'updated_at',
        'approved_at',
        'approved_by',
    )
    actions = ['approve_selected', 'reject_selected', 'revert_to_pending']

    def company_name(self, obj):
        return (obj.signup_metadata or {}).get('company_name', '—')
    company_name.short_description = 'Company'

    @admin.action(description='Approve selected users')
    def approve_selected(self, request, queryset):
        now = timezone.now()
        updated = queryset.exclude(approval_status=UserProfile.APPROVAL_APPROVED).update(
            approval_status=UserProfile.APPROVAL_APPROVED,
            approved_at=now,
            approved_by=request.user,
        )
        self.message_user(
            request,
            f'Approved {updated} user(s).',
            level=messages.SUCCESS,
        )

    @admin.action(description='Reject selected users')
    def reject_selected(self, request, queryset):
        updated = queryset.exclude(approval_status=UserProfile.APPROVAL_REJECTED).update(
            approval_status=UserProfile.APPROVAL_REJECTED,
            approved_at=None,
            approved_by=request.user,
        )
        self.message_user(
            request,
            f'Rejected {updated} user(s).',
            level=messages.WARNING,
        )

    @admin.action(description='Revert to pending')
    def revert_to_pending(self, request, queryset):
        updated = queryset.exclude(approval_status=UserProfile.APPROVAL_PENDING).update(
            approval_status=UserProfile.APPROVAL_PENDING,
            approved_at=None,
            approved_by=None,
        )
        self.message_user(
            request,
            f'Reverted {updated} user(s) to pending.',
            level=messages.INFO,
        )
