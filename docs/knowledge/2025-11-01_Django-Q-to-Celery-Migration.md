# Django-Q to Celery Migration Guide

**Date**: 2025-11-01
**Reason**: Moving from Windows to POP!_OS Linux - Celery is the recommended async task system for Linux/production environments

---

## Overview

This migration replaced **Django-Q** with **Celery + Redis** for async task processing.

### Why Migrate?

**Django-Q Advantages** (why we used it initially):
- ✅ No extra services needed (uses PostgreSQL for queue)
- ✅ Simple setup - just install and add to INSTALLED_APPS
- ✅ Perfect for Windows development
- ✅ Built-in admin UI

**Celery Advantages** (why we switched):
- ✅ Industry standard for production Django apps
- ✅ Better suited for Linux environments
- ✅ More robust for high-volume task processing
- ✅ Better monitoring and debugging tools
- ✅ Recommended by Django community for production

---

## Migration Summary

### Dependencies Changed

**Removed:**
```python
django-q2==1.6.2
```

**Added:**
```python
celery==5.3.4
redis==5.0.1
django-celery-results==2.5.1
```

### Code Changes

#### 1. Created `config/celery.py`
```python
from celery import Celery

app = Celery('bim_coordinator')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

#### 2. Updated `config/__init__.py`
```python
from .celery import app as celery_app
__all__ = ('celery_app',)
```

#### 3. Updated `config/settings.py`

**Removed `Q_CLUSTER` config**, added Celery config:
```python
CELERY_BROKER_URL = env('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = 'django-db'  # Store results in Django database
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
# ... more Celery settings
```

**Removed from INSTALLED_APPS:**
```python
'django_q',
```

**Added to INSTALLED_APPS:**
```python
'django_celery_results',
```

#### 4. Updated Task Definitions (`apps/models/tasks.py`)

**Before (Django-Q):**
```python
def process_ifc_task(model_id, file_path, skip_geometry=False):
    # Just a regular function, no decorator
    pass
```

**After (Celery):**
```python
from celery import shared_task

@shared_task(bind=True, name='apps.models.tasks.process_ifc_task')
def process_ifc_task(self, model_id, file_path, skip_geometry=False):
    # Note the 'self' parameter when bind=True
    pass
```

All task functions updated:
- `process_ifc_task()` → `@shared_task`
- `revert_model_task()` → `@shared_task`
- `enrich_model_task()` → `@shared_task`
- `debug_task()` → `@shared_task`

#### 5. Updated Task Dispatch (`apps/models/views.py`)

**Before (Django-Q):**
```python
from django_q.tasks import async_task

task_id = async_task(
    process_ifc_task,
    str(model.id),
    full_path,
    skip_geometry=True
)
model.task_id = task_id
```

**After (Celery):**
```python
# No import needed - tasks imported directly

result = process_ifc_task.delay(
    str(model.id),
    full_path,
    skip_geometry=True
)
model.task_id = result.id
```

**Key differences:**
- Django-Q: `async_task(function, arg1, arg2)`
- Celery: `function.delay(arg1, arg2)` or `function.apply_async()`

---

## Setup Instructions (POP!_OS / Linux)

### 1. Install Redis

```bash
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server

# Enable Redis to start on boot
sudo systemctl enable redis-server

# Test Redis
redis-cli ping  # Should return PONG
```

### 2. Install Python Dependencies

```bash
conda activate sprucelab
cd backend
pip install -r requirements.txt
```

### 3. Run Migrations

```bash
# Create tables for django-celery-results
python manage.py migrate
```

### 4. Start Services

**Terminal 1: Django**
```bash
python manage.py runserver
```

**Terminal 2: Celery Worker**
```bash
cd backend
celery -A config worker --loglevel=info
```

**Terminal 3 (Optional): Celery Monitoring**
```bash
# Install flower (Celery monitoring tool)
pip install flower

# Start Flower
celery -A config flower
# Access at http://localhost:5555
```

---

## Testing the Setup

### Quick Test

```python
# In Django shell
python manage.py shell

from apps.models.tasks import debug_task

# Dispatch task
result = debug_task.delay()
print(f"Task ID: {result.id}")

# Check status
print(f"Status: {result.status}")

# Get result (waits for completion)
print(f"Result: {result.get(timeout=10)}")
```

### Full IFC Processing Test

```bash
# From django-test directory
python test_ifc_processing.py
```

---

## Monitoring & Debugging

### Check Task Status in Database

```sql
SELECT * FROM django_celery_results_taskresult
ORDER BY date_done DESC
LIMIT 10;
```

### View Worker Logs

```bash
# Worker terminal shows real-time logs
celery -A config worker --loglevel=debug  # More verbose
```

### Use Flower for Monitoring

```bash
pip install flower
celery -A config flower

# Open browser: http://localhost:5555
# Shows:
# - Active workers
# - Task history
# - Task details
# - Success/failure rates
```

---

## Troubleshooting

### Redis Not Running

```bash
# Check status
sudo systemctl status redis-server

# Start if stopped
sudo systemctl start redis-server

# Check connection
redis-cli ping
```

### Tasks Not Executing

1. **Check Celery worker is running**
   ```bash
   celery -A config inspect active
   ```

2. **Check Redis connection**
   ```bash
   redis-cli
   > KEYS *
   ```

3. **Check Django settings**
   - Verify `CELERY_BROKER_URL` in settings.py
   - Verify `django_celery_results` in INSTALLED_APPS

### Task Fails Silently

- Check Celery worker terminal for errors
- Use `celery -A config worker --loglevel=debug`
- Check database: `django_celery_results_taskresult` table

---

## Differences Summary

| Aspect | Django-Q | Celery |
|--------|----------|--------|
| **Broker** | PostgreSQL | Redis |
| **Setup** | Simple (no extra service) | Requires Redis |
| **Task Definition** | Plain function | `@shared_task` decorator |
| **Task Dispatch** | `async_task(func, args)` | `func.delay(args)` |
| **Result Backend** | PostgreSQL | Django DB (via django-celery-results) |
| **Monitoring** | Django Admin | Flower + Django Admin |
| **Platform** | Great for Windows | Great for Linux/Production |
| **Task ID** | Returns task_id directly | Returns AsyncResult object with `.id` |

---

## Files Modified

1. ✅ `requirements.txt` - Replaced django-q2 with celery
2. ✅ `environment.yml` - Synced with requirements.txt
3. ✅ `config/celery.py` - Created Celery app
4. ✅ `config/__init__.py` - Import Celery app
5. ✅ `config/settings.py` - Replaced Q_CLUSTER with CELERY_* settings
6. ✅ `apps/models/tasks.py` - Added @shared_task decorators
7. ✅ `apps/models/views.py` - Changed async_task() to .delay()
8. ✅ `CLAUDE.md` - Updated documentation
9. ✅ `backend/README.md` - Updated setup instructions

---

## Rollback Plan (If Needed)

If you need to rollback to Django-Q:

1. Restore from archive: `docs/archive/DJANGO_Q_SETUP.md`
2. Reinstall Django-Q: `pip install django-q2==1.6.2`
3. Revert code changes (git revert or restore from versions)
4. Remove Celery config and Redis dependency

---

**Migration Completed**: 2025-11-01
**Status**: ✅ All tasks migrated successfully
**Platform**: POP!_OS Linux with Redis + Celery
