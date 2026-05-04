"""
Supabase JWT Authentication for Django REST Framework.

Verification strategy: delegate to Supabase. We do NOT try to verify the JWT
signature locally. Modern Supabase projects use rotating signing keys (with
opaque `kid` values) that aren't exposed via the classic "JWT Secret" field
in the dashboard, and the JWKS endpoint only advertises an unrelated ES256
public key. Rather than fight the key-rotation mess, we call
`/auth/v1/user` with the bearer token and trust Supabase's answer. A short-
lived Django cache keeps the overhead to ~1 Supabase call per minute per
active session.
"""

import hashlib
import json
import logging
import urllib.error
import urllib.request
import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import authentication, exceptions

from apps.accounts.models import UserProfile

User = get_user_model()
logger = logging.getLogger('apps.accounts.auth')

# How long to cache a successful /auth/v1/user response. Short enough that a
# revoked/signed-out token stops working quickly, long enough to absorb
# request bursts from the same session.
USER_INFO_CACHE_TTL = 60  # seconds

# Network timeout for the Supabase user-info call.
USER_INFO_TIMEOUT = 5  # seconds


def _cache_key(token: str) -> str:
    return f'supabase:userinfo:{hashlib.sha256(token.encode()).hexdigest()}'


def _fetch_userinfo(token: str) -> dict:
    """
    Call Supabase's /auth/v1/user with the bearer token. Returns the user
    payload on success. Raises AuthenticationFailed on failure.
    """
    supabase_url = (settings.SUPABASE_URL or '').rstrip('/')
    anon_key = settings.SUPABASE_KEY
    if not supabase_url or not anon_key:
        raise exceptions.AuthenticationFailed(
            'SUPABASE_URL or SUPABASE_KEY not configured'
        )

    req = urllib.request.Request(
        f'{supabase_url}/auth/v1/user',
        headers={
            'apikey': anon_key,
            'Authorization': f'Bearer {token}',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=USER_INFO_TIMEOUT) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')[:200] if e.fp else ''
        if e.code == 401:
            raise exceptions.AuthenticationFailed('Token rejected by Supabase')
        raise exceptions.AuthenticationFailed(
            f'Supabase userinfo failed ({e.code}): {body}'
        )
    except urllib.error.URLError as e:
        raise exceptions.AuthenticationFailed(f'Supabase unreachable: {e}')
    except Exception as e:
        logger.exception('supabase-auth: unexpected userinfo error: %s', e)
        raise exceptions.AuthenticationFailed(f'Supabase userinfo error: {e}')


class SupabaseAuthentication(authentication.BaseAuthentication):
    """
    Authenticate requests using Supabase session tokens.

    Flow:
    1. Extract Bearer token from Authorization header
    2. Check local cache for a recent /auth/v1/user response for this token
    3. If cache miss, ask Supabase to validate the token
    4. On success, lazily create/update a Django User + UserProfile keyed by
       the Supabase user's UUID
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ', 1)[1].strip()
        if not token:
            return None

        # Quick sanity: reject malformed JWTs before hitting Supabase.
        try:
            jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as e:
            logger.warning('supabase-auth: malformed token — %s', e)
            raise exceptions.AuthenticationFailed(f'Malformed token: {e}')

        # Cached path: if we validated this exact token recently, skip the
        # network round-trip.
        cache_key = _cache_key(token)
        userinfo = cache.get(cache_key)
        if userinfo is None:
            userinfo = _fetch_userinfo(token)
            cache.set(cache_key, userinfo, USER_INFO_CACHE_TTL)

        try:
            user = self._get_or_create_user(userinfo)
        except exceptions.AuthenticationFailed:
            raise
        except Exception as e:
            logger.exception('supabase-auth: user resolution failed: %s', e)
            raise exceptions.AuthenticationFailed(f'User resolution failed: {e}')

        return (user, userinfo)

    @transaction.atomic
    def _get_or_create_user(self, userinfo: dict):
        sub = userinfo.get('id')  # /auth/v1/user uses `id`, not `sub`
        email = userinfo.get('email')

        if not sub:
            raise exceptions.AuthenticationFailed('Userinfo missing id')

        try:
            supabase_id = uuid.UUID(sub)
        except (ValueError, TypeError):
            raise exceptions.AuthenticationFailed('Userinfo id is not a valid UUID')

        metadata = userinfo.get('user_metadata') or {}
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

        # 2. Bootstrap: link to an existing Django user by email, otherwise
        #    create a fresh one.
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
            user_changed = []
            if first_name and not user.first_name:
                user.first_name = first_name
                user_changed.append('first_name')
            if last_name and not user.last_name:
                user.last_name = last_name
                user_changed.append('last_name')
            if user_changed:
                user.save(update_fields=user_changed)

        # Superusers (e.g. promoted via management command) auto-approve so
        # they can reach the Django admin without going through the waitlist.
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


class DevBypassAuthentication(authentication.BaseAuthentication):
    """
    DEV-ONLY auth bypass for local development.

    Returns a known dev superuser (DEV_AUTH_BYPASS_EMAIL, default
    `dev@local.test`) without any token check, so /api/me/ + every protected
    DRF endpoint accepts unauthenticated requests as that user.

    Active only when BOTH `DEV_AUTH_BYPASS=1` AND `DEBUG=True`. Production has
    DEBUG=False, so even if the env var leaked into a prod deploy, the bypass
    cannot fire there. Returns None (chains to next auth class) when not
    active.

    Auto-creates the dev user + an approved UserProfile on first request, so
    bypass works against a fresh local DB with no manual seeding.
    """

    def authenticate(self, request):
        from django.conf import settings as _settings  # local for hot-reload friendliness
        if not (_settings.DEBUG and getattr(_settings, 'DEV_AUTH_BYPASS', False)):
            return None
        return (self._get_or_create_dev_user(_settings.DEV_AUTH_BYPASS_EMAIL), None)

    @staticmethod
    @transaction.atomic
    def _get_or_create_dev_user(email: str):
        username = email.split('@', 1)[0][:150] or 'dev'
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': username,
                'is_active': True,
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if not created:
            dirty = []
            for attr in ('is_active', 'is_staff', 'is_superuser'):
                if not getattr(user, attr):
                    setattr(user, attr, True)
                    dirty.append(attr)
            if dirty:
                user.save(update_fields=dirty)

        profile = UserProfile.objects.filter(user=user).first()
        if profile is None:
            profile = UserProfile.objects.create(
                user=user,
                supabase_id=uuid.uuid4(),  # synthetic; never reaches Supabase
                display_name='Dev (local bypass)',
                approval_status=UserProfile.APPROVAL_APPROVED,
                approved_at=timezone.now(),
            )
        elif profile.approval_status != UserProfile.APPROVAL_APPROVED:
            profile.approval_status = UserProfile.APPROVAL_APPROVED
            profile.approved_at = timezone.now()
            profile.save(update_fields=['approval_status', 'approved_at', 'updated_at'])
        return user
