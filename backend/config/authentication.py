"""
Supabase JWT Authentication for Django REST Framework.

Validates JWTs issued by Supabase and creates/retrieves local Django users.
"""

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import authentication, exceptions


User = get_user_model()


class SupabaseAuthentication(authentication.BaseAuthentication):
    """
    Authenticate requests using Supabase JWT tokens.

    Usage:
    - Frontend authenticates with Supabase (login, OAuth, etc.)
    - Frontend sends JWT in Authorization header: "Bearer <token>"
    - This class validates the JWT and returns a Django user
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return None  # No auth header, let other authenticators try

        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ')[1]

        try:
            payload = self._decode_token(token)
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')

        user = self._get_or_create_user(payload)
        return (user, payload)

    def _decode_token(self, token):
        """Decode and validate the Supabase JWT."""
        jwt_secret = settings.SUPABASE_JWT_SECRET

        if not jwt_secret:
            raise exceptions.AuthenticationFailed(
                'SUPABASE_JWT_SECRET not configured'
            )

        # Supabase uses HS256 by default
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=['HS256'],
            audience='authenticated',
        )

        return payload

    def _get_or_create_user(self, payload):
        """Get or create a Django user from the Supabase JWT payload."""
        supabase_user_id = payload.get('sub')
        email = payload.get('email')

        if not supabase_user_id:
            raise exceptions.AuthenticationFailed('Token missing user ID')

        # Try to find existing user by supabase ID stored in username
        # or by email as fallback
        user = None

        # First try by username (we store supabase_user_id there)
        try:
            user = User.objects.get(username=supabase_user_id)
        except User.DoesNotExist:
            pass

        # Fallback: try by email
        if not user and email:
            try:
                user = User.objects.get(email=email)
                # Update username to supabase ID for future lookups
                user.username = supabase_user_id
                user.save(update_fields=['username'])
            except User.DoesNotExist:
                pass

        # Create new user if not found
        if not user:
            user = User.objects.create(
                username=supabase_user_id,
                email=email or f'{supabase_user_id}@supabase.user',
                # User metadata from Supabase
                first_name=payload.get('user_metadata', {}).get('full_name', '')[:30],
            )

        return user

    def authenticate_header(self, request):
        """Return the WWW-Authenticate header value."""
        return 'Bearer realm="api"'
