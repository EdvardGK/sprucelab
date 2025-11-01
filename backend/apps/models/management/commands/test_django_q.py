"""
Django management command to test Django-Q setup.

Usage:
    python manage.py test_django_q
"""
from django.core.management.base import BaseCommand
from django.conf import settings
import time


class Command(BaseCommand):
    help = 'Test Django-Q configuration and task execution'

    def handle(self, *args, **options):
        """Run Django-Q tests."""
        self.stdout.write("\n" + "="*60)
        self.stdout.write(self.style.SUCCESS("Django-Q Configuration Test"))
        self.stdout.write("="*60 + "\n")

        # Test 1: Check database connection
        self.stdout.write(self.style.WARNING("Test 1: Checking database connection..."))
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()

            self.stdout.write(f"  Database: {settings.DATABASES['default']['NAME']}")
            self.stdout.write(self.style.SUCCESS("  ✅ Database connection successful!\n"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ Database connection failed: {str(e)}\n"))
            return

        # Test 2: Check Django-Q configuration
        self.stdout.write(self.style.WARNING("Test 2: Checking Django-Q configuration..."))
        try:
            if hasattr(settings, 'Q_CLUSTER'):
                q_config = settings.Q_CLUSTER
                self.stdout.write(f"  Cluster name: {q_config.get('name', 'N/A')}")
                self.stdout.write(f"  Workers: {q_config.get('workers', 'N/A')}")
                self.stdout.write(f"  Timeout: {q_config.get('timeout', 'N/A')}s")
                self.stdout.write(f"  ORM: {q_config.get('orm', 'N/A')}")
                self.stdout.write(self.style.SUCCESS("  ✅ Django-Q configured!\n"))
            else:
                self.stdout.write(self.style.ERROR("  ❌ Q_CLUSTER not found in settings\n"))
                return
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ Configuration error: {str(e)}\n"))
            return

        # Test 3: Check Django-Q tables exist
        self.stdout.write(self.style.WARNING("Test 3: Checking Django-Q database tables..."))
        try:
            from django_q.models import Task, Schedule

            task_count = Task.objects.count()
            schedule_count = Schedule.objects.count()

            self.stdout.write(f"  Tasks in database: {task_count}")
            self.stdout.write(f"  Schedules in database: {schedule_count}")
            self.stdout.write(self.style.SUCCESS("  ✅ Django-Q tables exist!\n"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ Django-Q tables missing: {str(e)}"))
            self.stdout.write(self.style.WARNING("  Run: python manage.py migrate\n"))
            return

        # Test 4: Check if worker is running (optional - not critical)
        self.stdout.write(self.style.WARNING("Test 4: Checking for active Django-Q workers..."))
        try:
            from django_q.models import Task

            # Check for recent task activity
            recent_tasks = Task.objects.filter(stopped__isnull=False).order_by('-stopped')[:5]

            if recent_tasks.exists():
                self.stdout.write(self.style.SUCCESS(f"  ✅ Found {recent_tasks.count()} recent completed tasks"))
                latest = recent_tasks.first()
                self.stdout.write(f"    Latest task: {latest.name} ({latest.func})")
                self.stdout.write(f"    Status: {'✅ Success' if latest.success else '❌ Failed'}")
            else:
                self.stdout.write(self.style.WARNING("  ⚠️  No recent task activity"))
                self.stdout.write("  This is OK if you haven't run the worker yet")
                self.stdout.write("  Start worker with: python manage.py qcluster")
            self.stdout.write("")

        except Exception as e:
            self.stdout.write(self.style.WARNING(f"  ⚠️  Could not check workers: {str(e)}\n"))

        # Test 5: Test task execution
        self.stdout.write(self.style.WARNING("Test 5: Testing task execution..."))
        try:
            from django_q.tasks import async_task
            from apps.models.tasks import debug_task

            self.stdout.write("  Dispatching debug_task...")
            task_id = async_task(debug_task)
            self.stdout.write(f"  Task ID: {task_id}")

            # Wait a moment for task to be queued
            time.sleep(1)

            # Check if task was queued
            from django_q.models import Task
            task = Task.objects.filter(id=task_id).first()

            if task:
                self.stdout.write(self.style.SUCCESS("  ✅ Task queued successfully!"))
                self.stdout.write(f"  Task name: {task.name}")
                self.stdout.write(f"  Task func: {task.func}")

                # Check if worker is running
                if task.stopped:
                    if task.success:
                        self.stdout.write(self.style.SUCCESS(f"  ✅ Task completed: {task.result}"))
                    else:
                        self.stdout.write(self.style.ERROR(f"  ❌ Task failed: {task.result}"))
                else:
                    self.stdout.write(self.style.WARNING("  ⏳ Task is queued/running"))
                    self.stdout.write("  Make sure worker is running: python manage.py qcluster")
            else:
                self.stdout.write(self.style.WARNING("  ⚠️  Task not found in database yet"))
                self.stdout.write("  This is OK - task may be processing")

            self.stdout.write("")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ Task execution error: {str(e)}\n"))
            import traceback
            self.stdout.write(traceback.format_exc())

        # Summary
        self.stdout.write("="*60)
        self.stdout.write(self.style.SUCCESS("Test Summary"))
        self.stdout.write("="*60)
        self.stdout.write("If all tests passed, your Django-Q setup is working correctly!")
        self.stdout.write("\nNext steps:")
        self.stdout.write("1. Start Django-Q worker: python manage.py qcluster")
        self.stdout.write("2. Upload an IFC file via API")
        self.stdout.write("3. Check task status: GET /api/models/{id}/status/")
        self.stdout.write("4. Monitor tasks in Django admin: /admin/django_q/task/")
        self.stdout.write("")
