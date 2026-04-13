"""
Supabase JWT Authentication for Django REST Framework.

Validates JWTs issued by Supabase and maps them to a local Django user via
the UserProfile shadow row keyed by supabase_id.
"""

import uuid

import jwt
from jwt import PyJWKClient
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import authentication, exceptions

from apps.accounts.models import UserProfile

User = get_user_model()

# Shared JWKS client: caches keys in-memory across requests. Supabase serves
# its signing keys at /auth/v1/.well-known/jwks.json and rotates them rarely.
_JWKS_CLIENT: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _JWKS_CLIENT
    if _JWKS_CLIENT is None:
        supabase_url = (settings.SUPABASE_URL or '').rstrip('/')
        if not supabase_url:
            raise exceptions.AuthenticationFailed('SUPABASE_URL not configured')
        _JWKS_CLIENT = PyJWKClient(
            f'{supabase_url}/auth/v1/.well-known/jwks.json',
            cache_keys=True,
            lifespan=3600,
        )
    return _JWKS_CLIENT


class SupabaseAuthentication(authentication.BaseAuthentication):
    """
    Authenticate requests using Supabase JWT tokens.

    Flow:
    - Frontend obtains a session via Supabase (OAuth, magic link, etc.)
    - Frontend sends the access token in `Authorization: Bearer <token>`
    - This class verifies the JWT with SUPABASE_JWT_SECRET and looks up (or
      creates) a Django User linked by UserProfile.supabase_id.
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')

        if not auth_header or not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ', 1)[1].strip()
        if not token:
            return None

        try:
            payload = self._decode_token(token)
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')

        user = self._get_or_create_user(payload)
        return (user, payload)

    def _decode_token(self, token):
        jwt_secret = settings.SUPABASE_JWT_SECRET
        if not jwt_secret:
            raise exceptions.AuthenticationFailed('SUPABASE_JWT_SECRET not configured')

        return jwt.decode(
            token,
            jwt_secret,
            algorithms=['HS256'],
            audience='authenticated',
        )

    @transaction.atomic
    def _get_or_create_user(self, payload):
        sub = payload.get('sub')
        email = payload.get('email')

        if not sub:
            raise exceptions.AuthenticationFailed('Token missing subject (sub)')

        try:
            supabase_id = uuid.UUID(sub)
        except (ValueError, TypeError):
            raise exceptions.AuthenticationFailed('Token subject is not a valid UUID')

        metadata = payload.get('user_metadata', {}) or {}
        first_name = (metadata.get('first_name') or '').strip()[:30]
        last_name = (metadata.get('last_name') or '').strip()[:150]
        display_name = (
            metadata.get('display_name')
            or metadata.get('full_name')
            or metadata.get('name')
            or metadata.get('preferred_username')
            or ' '.join(filter(None, [first_name, last_name]))
            or ''
        )[:255]
        avatar_url = (metadata.get('avatar_url') or '')[:500]

        # Self-reported signup info (company_name, role, use_case, etc.)
        signup_metadata = {
            k: v
            for k, v in metadata.items()
            if k not in ('first_name', 'last_name', 'display_name', 'full_name',
                         'name', 'preferred_username', 'avatar_url',
                         'email_verified', 'phone_verified', 'sub', 'iss', 'picture')
        }

        # 1. Fast path: profile already exists.
        profile = (
            UserProfile.objects
            .select_related('user')
            .filter(supabase_id=supabase_id)
            .first()
        )
        if profile:
            self._refresh_profile(profile, email, display_name, avatar_url, signup_metadata)
            return profile.user

        # 2. Bootstrap: link to an existing Django user by email (e.g. the
        #    pre-seeded superuser), otherwise create a fresh user.
        user = None
        if email:
            user = User.objects.filter(email__iexact=email).first()

        if user is None:
            user = User.objects.create_user(
                username=self._unique_username(email, supabase_id),
                email=email or '',
                first_name=first_name or (display_name.split(' ', 1)[0][:30] if display_name else ''),
                last_name=last_name,
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])
        else:
            # Sync first/last name from metadata if missing on the linked user.
            user_changed = []
            if first_name and not user.first_name:
                user.first_name = first_name
                user_changed.append('first_name')
            if last_name and not user.last_name:
                user.last_name = last_name
                user_changed.append('last_name')
            if user_changed:
                user.save(update_fields=user_changed)

        # Superusers (e.g. the first bootstrap admin) are auto-approved so
        # they can reach the Django admin from day one.
        initial_status = (
            UserProfile.APPROVAL_APPROVED
            if user.is_superuser
            else UserProfile.APPROVAL_PENDING
        )
        approved_at = timezone.now() if user.is_superuser else None

        UserProfile.objects.create(
            user=user,
            supabase_id=supabase_id,
            display_name=display_name,
            avatar_url=avatar_url,
            approval_status=initial_status,
            approved_at=approved_at,
            signup_metadata=signup_metadata,
        )
        return user

    @staticmethod
    def _refresh_profile(profile, email, display_name, avatar_url, signup_metadata):
        dirty = []
        if display_name and profile.display_name != display_name:
            profile.display_name = display_name
            dirty.append('display_name')
        if avatar_url and profile.avatar_url != avatar_url:
            profile.avatar_url = avatar_url
            dirty.append('avatar_url')
        if signup_metadata:
            merged = dict(profile.signup_metadata or {})
            changed = False
            for k, v in signup_metadata.items():
                if merged.get(k) != v:
                    merged[k] = v
                    changed = True
            if changed:
                profile.signup_metadata = merged
                dirty.append('signup_metadata')
        if email and profile.user.email != email:
            profile.user.email = email
            profile.user.save(update_fields=['email'])
        if dirty:
            profile.save(update_fields=dirty + ['updated_at'])

    @staticmethod
    def _unique_username(email, supabase_id):
        base = (email or str(supabase_id)).split('@', 1)[0][:150] or str(supabase_id)
        candidate = base
        suffix = 0
        while User.objects.filter(username=candidate).exists():
            suffix += 1
            candidate = f'{base[:140]}-{suffix}'
        return candidate

    def authenticate_header(self, request):
        return 'Bearer realm="api"'
