from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    APPROVAL_PENDING = 'pending'
    APPROVAL_APPROVED = 'approved'
    APPROVAL_REJECTED = 'rejected'
    APPROVAL_STATUS_CHOICES = [
        (APPROVAL_PENDING, 'Pending'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    supabase_id = models.UUIDField(unique=True, db_index=True)
    display_name = models.CharField(max_length=255, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True)

    approval_status = models.CharField(
        max_length=16,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING,
        db_index=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_profiles',
    )
    signup_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Self-reported info from signup: company_name, role, use_case, etc.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts_userprofile'

    def __str__(self):
        return f'{self.display_name or self.user.email} ({self.approval_status})'

    @property
    def is_approved(self) -> bool:
        return self.approval_status == self.APPROVAL_APPROVED
