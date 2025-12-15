# Django-Q Setup Guide

**✅ Windows Native - No Redis Required!**

Django-Q is a native Django task queue that uses your existing PostgreSQL database. Perfect for Windows development!

---

## 🎯 Why Django-Q?

**Advantages over Celery:**
- ✅ **No Redis needed** - uses PostgreSQL
- ✅ **Windows native** - no WSL/Docker required
- ✅ **Simpler setup** - just install and run
- ✅ **Built-in admin dashboard** - monitor tasks in Django admin
- ✅ **Fewer moving parts** - 2 processes instead of 3

**Architecture:**
```
API Request → Django View → Django-Q Task → PostgreSQL Queue → Worker Pool → Processing
```

---

## 📦 Installation

### Option 1: Using Conda (Recommended)

```bash
# Activate your environment
conda activate sprucelab

# Update environment from file (includes django-q2)
conda env update -f environment-celery.yml --prune
```

### Option 2: Using Pip

```bash
pip install django-q2==1.6.2
```

---

## ⚙️ Configuration

Already configured in `backend/config/settings.py`:

```python
INSTALLED_APPS = [
    ...
    'django_q',
]

Q_CLUSTER = {
    'name': 'BIM_Coordinator',
    'workers': 4,  # 4 worker processes
    'timeout': 1800,  # 30 minutes max per task
    'max_attempts': 3,  # Retry failed tasks 3 times
    'orm': 'default',  # Uses PostgreSQL database
}
```

---

## 🚀 Running Django-Q

### 1. Run Migrations (First Time Only)

```bash
cd backend
python manage.py migrate
```

This creates Django-Q tables in your PostgreSQL database.

### 2. Start Services (2 Terminals)

**Terminal 1 - Django Server:**
```bash
conda activate sprucelab
cd backend
python manage.py runserver
```

**Terminal 2 - Django-Q Worker:**
```bash
conda activate sprucelab
cd backend
python manage.py qcluster
```

**Optional Terminal 3 - Frontend:**
```bash
cd frontend
yarn dev
```

---

## 🧪 Testing Django-Q

### Test Command

```bash
python manage.py test_django_q
```

This verifies:
- ✅ Database connection
- ✅ Django-Q configuration
- ✅ Worker status
- ✅ Task execution

### Manual Test (Django Shell)

```bash
python manage.py shell
```

```python
from django_q.tasks import async_task
from apps.models.tasks import debug_task

# Dispatch task
task_id = async_task(debug_task)
print(f"Task ID: {task_id}")

# Check result (wait a few seconds)
from django_q.tasks import result
result_data = result(task_id)
print(result_data)
```

### Via API (Upload IFC)

```bash
# Upload file
curl -X POST http://localhost:8000/api/models/upload/ \
  -F "file=@test.ifc" \
  -F "project_id=YOUR_PROJECT_ID"

# Response includes task_id
# {
#   "model": {..., "task_id": "abc-123"},
#   "task_id": "abc-123",
#   "message": "Processing started..."
# }

# Check status
curl http://localhost:8000/api/models/{model_id}/status/

# Response includes task state
# {
#   "status": "processing",
#   "task_id": "abc-123",
#   "task_state": "STARTED",
#   ...
# }
```

---

## 📊 Monitoring Tasks

### Django Admin Dashboard

1. Go to: `http://localhost:8000/admin/`
2. Navigate to **Django Q > Tasks**
3. See all tasks with status, results, and errors

**Columns:**
- **Name**: Task function name
- **Func**: Full import path
- **Started**: When task began
- **Stopped**: When task finished
- **Success**: ✅ or ❌
- **Result**: Return value or error message

### Command Line

```bash
# Show queued tasks
python manage.py qmonitor

# Show task statistics
python manage.py qinfo
```

---

## 🐛 Troubleshooting

### Worker not processing tasks

**Check if worker is running:**
```bash
# Look for "qcluster" process
# Windows PowerShell:
Get-Process python

# Should see multiple python processes (Django + workers)
```

**Restart worker:**
- Stop: `CTRL+C` in qcluster terminal
- Start: `python manage.py qcluster`

### Tasks stuck in queue

**Check database connection:**
```bash
python manage.py dbshell
# Should connect to PostgreSQL
\dt django_q*
# Should show Django-Q tables
```

**Purge stuck tasks:**
```python
# Django shell
from django_q.models import Task
Task.objects.filter(success=None, stopped__isnull=True).delete()
```

### Database errors

**Error:** `table "django_q_task" does not exist`

**Solution:**
```bash
python manage.py migrate django_q
```

### Worker memory issues

**Reduce worker count:**

Edit `backend/config/settings.py`:
```python
Q_CLUSTER = {
    'workers': 2,  # Reduce from 4 to 2
    'recycle': 50,  # Restart workers more often
    ...
}
```

---

## 🔄 Task Lifecycle

1. **Queued**: Task created, waiting for worker
2. **Started**: Worker picked up task
3. **Processing**: Task function executing
4. **Success**: Task completed successfully
5. **Failed**: Task raised exception (will retry up to 3 times)

---

## ⚡ Performance Tips

### Worker Scaling

```bash
# Run multiple workers for higher throughput
# Terminal 1
python manage.py qcluster

# Terminal 2
python manage.py qcluster

# Each qcluster runs 4 workers by default = 8 total workers
```

### Task Priority

```python
# High priority task (processed first)
async_task(process_ifc_task, model_id, file_path, priority='high')

# Low priority (processed last)
async_task(background_cleanup, priority='low')
```

### Scheduled Tasks

```python
from django_q.tasks import schedule
from datetime import timedelta

# Run task every hour
schedule(
    'apps.models.tasks.cleanup_old_files',
    schedule_type='I',  # Interval
    minutes=60,
)
```

---

## 📋 Quick Reference

### Start Services
```bash
# Terminal 1: Django
python manage.py runserver

# Terminal 2: Django-Q Worker
python manage.py qcluster
```

### Dispatch Task
```python
from django_q.tasks import async_task
task_id = async_task(function_name, arg1, arg2)
```

### Check Result
```python
from django_q.tasks import result
result_data = result(task_id)
```

### Monitor
```bash
# Admin: http://localhost:8000/admin/django_q/task/
# Command: python manage.py qmonitor
```

---

## 🆚 Django-Q vs Celery

| Feature | Django-Q | Celery |
|---------|----------|--------|
| **Broker** | PostgreSQL | Redis/RabbitMQ |
| **Windows** | ✅ Native | ⚠️ Requires workarounds |
| **Setup** | Simple | Complex |
| **Dependencies** | None (uses Django ORM) | Redis server |
| **Monitoring** | Django Admin | Flower (separate) |
| **Task Types** | Async, Scheduled | Async, Scheduled, Beat |
| **Maturity** | Stable | Very mature |

**When to use Django-Q:**
- ✅ Windows development
- ✅ Simple async tasks
- ✅ Want fewer dependencies
- ✅ Prefer Django admin monitoring

**When to use Celery:**
- Complex routing needs
- High-volume task processing (10,000+ tasks/sec)
- Need advanced features (canvas, chords)
- Already have Redis infrastructure

---

## 📚 More Information

- Django-Q Docs: https://django-q2.readthedocs.io/
- Task API: https://django-q2.readthedocs.io/en/latest/tasks.html
- Admin Guide: https://django-q2.readthedocs.io/en/latest/admin.html

---

**Last Updated**: Session 017 (2025-10-20)
**Framework**: Django-Q 1.6.2
