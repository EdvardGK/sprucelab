"""
Django settings for BIM Coordinator Platform.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import dj_database_url

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Add lib/ to Python path for vendored packages (e.g. ifc_toolkit)
sys.path.insert(0, str(BASE_DIR / 'lib'))

# Load environment variables
# Priority: .env.dev (local dev) > .env.local (overrides) > .env (base config)
dev_env_path = BASE_DIR.parent / '.env.dev'
local_env_path = BASE_DIR / '.env.local'
root_env_path = BASE_DIR.parent / '.env'

if dev_env_path.exists():
    print(f"Loading env: {dev_env_path}")
    load_dotenv(dev_env_path)
elif local_env_path.exists():
    print(f"Loading env: {local_env_path}")
    load_dotenv(local_env_path)
else:
    print(f"Loading env: {root_env_path}")
    load_dotenv(root_env_path)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-change-this-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.getenv(
    'ALLOWED_HOSTS',
    'localhost,127.0.0.1,sprucelab-production.up.railway.app,api.sprucelab.io',
).split(',')


# --- Security headers ------------------------------------------------------
# These are all free and apply to every response via SecurityMiddleware +
# XFrameOptionsMiddleware. Gated on `not DEBUG` where the behavior would
# break local development (HSTS, SSL redirect).

# Don't sniff MIME types — stops some XSS vectors
SECURE_CONTENT_TYPE_NOSNIFF = True

# Deprecated but cheap — older browsers honor it
SECURE_BROWSER_XSS_FILTER = True

# Limit referrer info leaked to third parties
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

# Disable clickjacking via frame embed
X_FRAME_OPTIONS = 'DENY'

# HSTS + SSL redirect — only in production to avoid breaking `runserver`.
# One year HSTS, include subdomains, preload-ready.
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_HSTS_SECONDS = 31_536_000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',  # PostgreSQL-specific fields (ArrayField)

    # Third party
    'rest_framework',
    'django_filters',  # DRF filtering backend
    'corsheaders',
    'django_celery_results',  # Store task results in database
    'storages',  # Cloud storage (Supabase/S3)

    # Local apps
    'apps.accounts',
    'apps.projects',
    'apps.models',
    'apps.entities',
    'apps.graph',
    'apps.scripting',
    'apps.bep',
    'apps.viewers',
    'apps.automation',
    'apps.field',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # CORS must be before CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASE_URL = os.getenv('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=0,  # Close connections immediately to prevent pool exhaustion
            conn_health_checks=True,  # Enable connection health checks
        )
    }
else:
    # Fallback for local development
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'bim_coordinator',
            'USER': 'postgres',
            'PASSWORD': 'postgres',
            'HOST': 'localhost',
            'PORT': '5432',
        }
    }


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# =============================================================================
# Cloud Storage (Supabase Storage - S3-compatible)
# =============================================================================
# Supabase Storage uses S3-compatible API
# Get credentials from: Supabase Dashboard → Settings → API → S3 Access Keys
#
# Required environment variables:
#   SUPABASE_STORAGE_BUCKET=ifc-files
#   SUPABASE_S3_ACCESS_KEY=your-access-key
#   SUPABASE_S3_SECRET_KEY=your-secret-key

USE_SUPABASE_STORAGE = os.getenv('SUPABASE_S3_ACCESS_KEY') is not None

if USE_SUPABASE_STORAGE:
    # Extract project ref from SUPABASE_URL (e.g., https://abcd1234.supabase.co)
    SUPABASE_PROJECT_REF = os.getenv('SUPABASE_URL', '').replace('https://', '').split('.')[0]

    # Public URL domain for accessing files (different from S3 endpoint)
    SUPABASE_PUBLIC_URL = f"{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/{os.getenv('SUPABASE_STORAGE_BUCKET', 'ifc-files')}"

    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
            "OPTIONS": {
                "bucket_name": os.getenv('SUPABASE_STORAGE_BUCKET', 'ifc-files'),
                "endpoint_url": f"https://{SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/s3",
                "access_key": os.getenv('SUPABASE_S3_ACCESS_KEY'),
                "secret_key": os.getenv('SUPABASE_S3_SECRET_KEY'),
                "region_name": os.getenv('SUPABASE_STORAGE_REGION', 'us-east-1'),
                "default_acl": None,  # Supabase handles ACL via bucket settings
                "querystring_auth": False,  # Public URLs without signatures
                "file_overwrite": True,
                "signature_version": "s3v4",
                "custom_domain": SUPABASE_PUBLIC_URL,  # Use public URL for file access
            },
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

    # Media URL points to Supabase Storage public URL
    MEDIA_URL = f"https://{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/{os.getenv('SUPABASE_STORAGE_BUCKET', 'ifc-files')}/"

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'config.authentication.SupabaseAuthentication',
        'rest_framework.authentication.SessionAuthentication',  # Keep for Django admin
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'apps.accounts.permissions.IsApprovedUser',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_FILTER_BACKENDS': [
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    # Throttling — baseline protection against abuse / accidental loops.
    # `anon` covers unauthenticated requests (health checks, /me/ probing).
    # `user` covers authenticated requests per account.
    # Individual views can override with their own throttle_classes or
    # throttle_scope for stricter limits.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min',
        'user': '600/min',
    },
}


# CORS Settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",  # React dev server
    "http://localhost:5173",  # Vite dev server
    "http://localhost:5174",  # Vite fallback port
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://sprucelab.vercel.app",  # Production frontend (Vercel alias)
    "https://sprucelab.io",          # Production custom domain
    "https://www.sprucelab.io",
]

# Allow Vercel preview deployments (unique URLs per deployment)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://sprucelab.*\.vercel\.app$",
]

# Add additional frontend URLs from environment
if os.getenv('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(os.getenv('FRONTEND_URL'))

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CORS_ALLOW_CREDENTIALS = True  # Allow cookies for CSRF

# CSRF Settings for API
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://sprucelab.vercel.app",  # Production frontend (Vercel alias)
    "https://sprucelab.io",          # Production custom domain
    "https://www.sprucelab.io",
]

# Add additional frontend URLs from environment
if os.getenv('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(os.getenv('FRONTEND_URL'))


# Supabase Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
SUPABASE_JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET')  # Found in Supabase Dashboard > Settings > API


# FastAPI IFC Service Configuration
# Used for IFC processing (replaces Celery for file processing)
IFC_SERVICE_URL = os.getenv('IFC_SERVICE_URL', 'http://localhost:8001')
IFC_SERVICE_API_KEY = os.getenv('IFC_SERVICE_API_KEY', 'sprucelab-ifc-service-dev-key-change-in-production')

# Django base URL (used for callbacks from FastAPI)
DJANGO_URL = os.getenv('DJANGO_URL', 'http://localhost:8000')


# Celery Configuration
# Uses Redis as message broker and result backend
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', os.getenv('REDIS_URL', 'redis://localhost:6379/0'))
CELERY_RESULT_BACKEND = 'django-db'  # Store results in Django database
CELERY_CACHE_BACKEND = 'django-cache'

# Task execution settings
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes hard limit
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60  # 25 minutes soft limit
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # One task at a time for long-running tasks
CELERY_WORKER_MAX_TASKS_PER_CHILD = 100  # Recycle worker after 100 tasks

# Task result settings
CELERY_RESULT_EXTENDED = True
CELERY_RESULT_EXPIRES = 3600 * 24  # Results expire after 24 hours

# Task retry settings
CELERY_TASK_ACKS_LATE = True  # Acknowledge task after completion
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# Serialization
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TIMEZONE = TIME_ZONE

# Monitoring
CELERY_WORKER_SEND_TASK_EVENTS = True
CELERY_TASK_SEND_SENT_EVENT = True


# File Upload Settings
MAX_UPLOAD_SIZE = 1024 * 1024 * 1024  # 1GB max file size
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE


# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Create logs directory if it doesn't exist
(BASE_DIR / 'logs').mkdir(exist_ok=True)
