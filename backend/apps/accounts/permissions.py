from rest_framework import permissions

from .models import UserProfile


# HTTP methods agents with `read_only` scope are allowed to use.
_READ_ONLY_METHODS = {'GET', 'HEAD', 'OPTIONS'}

# Path prefixes that only `admin`-scoped agents may write to.
# Operators can still GET these — gated by method, not just path.
_ADMIN_ONLY_WRITE_PREFIXES = (
    '/api/auth/',                         # user create / approve / reject
    '/api/automation/agent/register/',    # mint new agent tokens
)


def _path_requires_admin_write(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _ADMIN_ONLY_WRITE_PREFIXES)


class IsApprovedUser(permissions.BasePermission):
    """
    Allow access to:
      - Authenticated browser users whose UserProfile.approval_status is
        'approved' (the original behavior — pending/rejected users 403).
      - Authenticated agents (request.auth is an AgentRegistration) whose
        scope permits the request method + path. Agents bypass the
        UserProfile approval check because their backing synthetic User is
        always pre-approved by AgentTokenAuthentication.

    Endpoints that unapproved users must reach (e.g. /api/me/ to read their
    own status) should override with `permission_classes = [IsAuthenticated]`.
    """

    message = 'Your account is awaiting approval.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Agent token path: gate by scope, ignore UserProfile approval.
        agent = self._agent_from_request(request)
        if agent is not None:
            return self._agent_scope_allows(agent, request)

        profile = getattr(user, 'profile', None)
        if profile is None:
            try:
                profile = UserProfile.objects.get(user=user)
            except UserProfile.DoesNotExist:
                return False

        return profile.approval_status == UserProfile.APPROVAL_APPROVED

    @staticmethod
    def _agent_from_request(request):
        auth = getattr(request, 'auth', None)
        try:
            from apps.automation.models import AgentRegistration
        except Exception:  # pragma: no cover — defensive
            return None
        return auth if isinstance(auth, AgentRegistration) else None

    @staticmethod
    def _agent_scope_allows(agent, request) -> bool:
        method = request.method.upper()
        scope = agent.scope

        if scope == 'read_only':
            return method in _READ_ONLY_METHODS

        # operator + admin can read anywhere.
        if method in _READ_ONLY_METHODS:
            return True

        # Writes: admin-only paths are restricted to admin scope; the rest
        # are open to both operator and admin.
        if _path_requires_admin_write(request.path):
            return scope == 'admin'

        return scope in ('operator', 'admin')
