from rest_framework import permissions

from .models import UserProfile


class IsApprovedUser(permissions.BasePermission):
    """
    Allow access only to authenticated users whose UserProfile.approval_status
    is 'approved'. Pending and rejected users are 403'd.

    Endpoints that unapproved users must reach (e.g. /api/me/ to read their
    own status) should override this with `permission_classes = [IsAuthenticated]`.
    """

    message = 'Your account is awaiting approval.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        profile = getattr(user, 'profile', None)
        if profile is None:
            try:
                profile = UserProfile.objects.get(user=user)
            except UserProfile.DoesNotExist:
                return False

        return profile.approval_status == UserProfile.APPROVAL_APPROVED
