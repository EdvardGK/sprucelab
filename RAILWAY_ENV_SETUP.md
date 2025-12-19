# Railway Environment Variables Setup

This document lists all environment variables needed for each Railway service.

## How to Set Variables in Railway

1. Go to your Railway project dashboard
2. Click on the service (Django, FastAPI, etc.)
3. Go to **Variables** tab
4. Add each variable below

---

## Service 1: Django Backend

### Required Variables

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `SECRET_KEY` | `your-super-secret-key-min-50-chars` | Django secret key (generate a new one!) |
| `DEBUG` | `False` | Must be False in production |
| `ALLOWED_HOSTS` | `sprucelab-django.up.railway.app,localhost` | Your Railway domain |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Supabase connection string |

### Redis (use Railway reference variables)

| Variable | Value |
|----------|-------|
| `REDIS_URL` | `redis://default:${{Redis.REDISPASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379` |
| `CELERY_BROKER_URL` | `redis://default:${{Redis.REDISPASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379/0` |

### Supabase Auth

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Your Supabase project URL |
| `SUPABASE_KEY` | `eyJhbGc...` | Supabase anon/public key |
| `SUPABASE_JWT_SECRET` | `your-jwt-secret` | Found in Supabase Dashboard > Settings > API |

### Supabase Storage (Optional - for file uploads)

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `SUPABASE_STORAGE_BUCKET` | `ifc-files` | Storage bucket name |
| `SUPABASE_S3_ACCESS_KEY` | `your-access-key` | S3-compatible access key |
| `SUPABASE_S3_SECRET_KEY` | `your-secret-key` | S3-compatible secret key |
| `SUPABASE_STORAGE_REGION` | `us-east-1` | Storage region |

### Frontend CORS

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `FRONTEND_URL` | `https://sprucelab.vercel.app` | Your frontend domain |

### FastAPI Service Communication

| Variable | Value | Description |
|----------|-------|-------------|
| `IFC_SERVICE_URL` | `http://${{ifc-service.RAILWAY_PRIVATE_DOMAIN}}:${{ifc-service.PORT}}` | Internal URL to FastAPI |
| `IFC_SERVICE_API_KEY` | `your-internal-api-key` | Shared secret for service-to-service auth |

---

## Service 2: FastAPI IFC Service

### Required Variables

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `DEBUG` | `False` | Must be False in production |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Same as Django (Supabase) |

### Redis

| Variable | Value |
|----------|-------|
| `REDIS_URL` | `redis://default:${{Redis.REDISPASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379/1` |

### Service Communication

| Variable | Value | Description |
|----------|-------|-------------|
| `DJANGO_URL` | `https://sprucelab-django.up.railway.app` | Public Django URL |
| `IFC_SERVICE_API_KEY` | `your-internal-api-key` | Must match Django's value |

### CORS (JSON array format)

| Variable | Example Value |
|----------|---------------|
| `CORS_ORIGINS` | `["https://sprucelab.vercel.app","https://sprucelab-django.up.railway.app"]` |

---

## Service 3: Redis

Redis is auto-configured by Railway. No manual variables needed.

**Important:** Do NOT generate a public domain for Redis!

---

## Quick Setup Checklist

### 1. Generate Public Domains
- [ ] Django service → Generate domain (e.g., `sprucelab-django.up.railway.app`)
- [ ] FastAPI service → **No public domain needed** (internal only)
- [ ] Redis → **No public domain** (internal only)

### 2. Set Django Variables
- [ ] `SECRET_KEY` - Generate new: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`
- [ ] `DEBUG=False`
- [ ] `ALLOWED_HOSTS` - Include your Railway domain
- [ ] `DATABASE_URL` - Your Supabase connection string
- [ ] `REDIS_URL` - Use Railway reference variable
- [ ] `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`
- [ ] `FRONTEND_URL` - Your Vercel frontend URL

### 3. Set FastAPI Variables
- [ ] `DEBUG=False`
- [ ] `DATABASE_URL` - Same as Django
- [ ] `REDIS_URL` - Use Railway reference variable
- [ ] `DJANGO_URL` - Your Django public domain
- [ ] `CORS_ORIGINS` - JSON array of allowed origins

### 4. Update Frontend
In Vercel (or wherever frontend is hosted):
- [ ] `VITE_API_URL=https://sprucelab-django.up.railway.app`

---

## Railway Reference Variables

Railway allows referencing variables from other services using `${{ServiceName.VARIABLE}}`:

```
# Reference Redis password from Redis service
${{Redis.REDISPASSWORD}}

# Reference private domain (internal networking)
${{Redis.RAILWAY_PRIVATE_DOMAIN}}

# Reference another service
${{ifc-service.RAILWAY_PRIVATE_DOMAIN}}
```

This enables secure internal communication without exposing services publicly.

---

## Troubleshooting

### "Connection refused" to Redis
- Check `REDIS_URL` uses `RAILWAY_PRIVATE_DOMAIN`, not public URL
- Ensure Redis service is running

### CORS errors
- Add your frontend URL to `CORS_ORIGINS` (FastAPI) and `FRONTEND_URL` (Django)
- Make sure URLs include `https://`

### 502 Bad Gateway
- Check healthcheck path exists (`/api/health/` for Django, `/` for FastAPI)
- Check logs for startup errors
- Verify `PORT` environment variable is used (Railway sets this automatically)

### Database connection errors
- Verify `DATABASE_URL` is correct
- For Supabase, use the "Connection string" from Project Settings > Database
- Use port `6543` (connection pooler) for better performance
