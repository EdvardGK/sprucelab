"""
Supabase JWT Authentication for Django REST Framework.

Validates JWTs issued by Supabase and maps them to a local Django user via
the UserProfile shadow row keyed by supabase_id.
"""

import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import authentication, exceptions

from apps.accounts.models import UserProfile

User = get_user_model()


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
        display_name = (
            metadata.get('full_name')
            or metadata.get('name')
            or metadata.get('preferred_username')
            or ''
        )[:255]
        avatar_url = (metadata.get('avatar_url') or '')[:500]

        # 1. Fast path: profile already exists.
        profile = (
            UserProfile.objects
            .select_related('user')
            .filter(supabase_id=supabase_id)
            .first()
        )
        if profile:
            self._refresh_profile(profile, email, display_name, avatar_url)
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
                first_name=display_name.split(' ', 1)[0][:30] if display_name else '',
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])

        UserProfile.objects.create(
            user=user,
            supabase_id=supabase_id,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        return user

    @staticmethod
    def _refresh_profile(profile, email, display_name, avatar_url):
        dirty = []
        if display_name and profile.display_name != display_name:
            profile.display_name = display_name
            dirty.append('display_name')
        if avatar_url and profile.avatar_url != avatar_url:
            profile.avatar_url = avatar_url
            dirty.append('avatar_url')
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
