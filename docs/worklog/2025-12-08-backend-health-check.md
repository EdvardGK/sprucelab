# Session: Backend Health Check (Linux Migration)

**Date**: 2025-12-08
**Focus**: Backend health check after Windows → Linux migration

## Context

Project was developed on Windows, recently moved to Linux. First session on Linux to verify backend works.

## Health Check Results

### Working
| Component | Status |
|-----------|--------|
| Python environment | `sprucelab` conda env, Python 3.11 |
| Django | 5.0 installed, `manage.py check` passes |
| Dependencies | All installed (celery, redis, ifcopenshell, psycopg2) |
| Redis | Running |
| Code syntax | All models/services compile OK |
| `.env` file | Exists at project root |

### Issues Found

1. **Supabase DB deleted** - Credentials in `.env` point to deleted project ("Tenant or user not found")
2. **No local PostgreSQL** - Was not installed on Linux

## Changes Made

### 1. Settings fallback changed to SQLite (temporary)
`backend/config/settings.py` lines 95-102:
- Changed PostgreSQL fallback to SQLite for testing
- **Note**: This won't work due to `ArrayField` usage - reverted approach

### 2. Commented out Supabase DATABASE_URL
`.env` line 7:
```
# DATABASE_URL=postgresql://postgres.mwcjhbvzhnzslnatglcg:...
```

### 3. Installed PostgreSQL
```bash
sudo apt install postgresql postgresql-contrib
```
PostgreSQL is now running on localhost:5432

## Next Session - TODO

### Immediate (5 min)
1. Create database and set password:
   ```bash
   sudo -u postgres createdb bim_coordinator
   sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
   ```

2. Revert settings.py to PostgreSQL fallback (undo SQLite change):
   ```python
   # Line 95-102 should be:
   else:
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
   ```

3. Run migrations:
   ```bash
   conda activate sprucelab
   cd backend
   python manage.py migrate
   ```

4. Create superuser:
   ```bash
   python manage.py createsuperuser
   ```

5. Test runserver:
   ```bash
   python manage.py runserver
   ```

### Optional
- Start Celery worker (Redis already running)
- Test frontend connection

## Files Modified

| File | Change |
|------|--------|
| `backend/config/settings.py` | Changed DB fallback to SQLite (needs revert) |
| `.env` | Commented out DATABASE_URL |

## Notes

- Latest worklog before this: `session-020-data-warehouse-rebuild.md`
- Database was intentionally wiped due to architecture issues (geometry in DB was wrong approach)
- New architecture: stream from IFC, don't store geometry in DB
- Two pending migrations exist: `entities/0006`, `models/0009`
