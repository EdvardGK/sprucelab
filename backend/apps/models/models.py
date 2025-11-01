"""
IFC Model and related models for BIM Coordinator Platform.
"""
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid


class Model(models.Model):
    """
    IFC model file and its metadata.
    """
    STATUS_CHOICES = [
        ('uploading', 'Uploading'),
        ('processing', 'Processing'),
        ('ready', 'Ready'),
        ('error', 'Error'),
    ]

    PARSING_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('parsing', 'Parsing'),
        ('parsed', 'Parsed'),
        ('failed', 'Failed'),
    ]

    GEOMETRY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('extracting', 'Extracting'),
        ('completed', 'Completed'),
        ('partial', 'Partial'),  # Some elements failed
        ('skipped', 'Skipped'),  # No geometry extraction requested
        ('failed', 'Failed'),
    ]

    VALIDATION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('validating', 'Validating'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='models')
    name = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    ifc_schema = models.CharField(max_length=50, blank=True, null=True)  # IFC2X3, IFC4, etc.
    file_url = models.URLField(max_length=500, blank=True, null=True)  # Supabase Storage URL
    file_size = models.BigIntegerField(default=0, help_text="File size in bytes")

    # ThatOpen Fragments storage (optimized binary format for 10-100x faster loading)
    fragments_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="URL to ThatOpen Fragments file (optimized binary format)"
    )
    fragments_size_mb = models.FloatField(
        null=True,
        blank=True,
        help_text="Size of Fragments file in MB"
    )
    fragments_generated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When Fragments file was generated"
    )

    # Legacy status field (deprecated, use stage-specific fields below)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploading')

    # Stage-specific status tracking (Layer 1, 2, 3)
    parsing_status = models.CharField(
        max_length=20,
        choices=PARSING_STATUS_CHOICES,
        default='pending',
        help_text="Layer 1: Metadata extraction status"
    )
    geometry_status = models.CharField(
        max_length=20,
        choices=GEOMETRY_STATUS_CHOICES,
        default='pending',
        help_text="Layer 2: Geometry extraction status"
    )
    validation_status = models.CharField(
        max_length=20,
        choices=VALIDATION_STATUS_CHOICES,
        default='pending',
        help_text="Layer 3: Validation status"
    )

    version_number = models.IntegerField(default=1)
    parent_model = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='versions')
    is_published = models.BooleanField(default=False, help_text="Whether this version is the active/published version")

    # Metadata
    element_count = models.IntegerField(default=0)
    storey_count = models.IntegerField(default=0)
    system_count = models.IntegerField(default=0)
    processing_error = models.TextField(blank=True, null=True)

    # Django Q task tracking
    task_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Django Q task ID for async processing"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'models'
        ordering = ['-created_at']
        unique_together = ['project', 'name', 'version_number']

    def __str__(self):
        return f"{self.name} (v{self.version_number})"

    def get_previous_version(self):
        """Get the previous version of this model."""
        return Model.objects.filter(
            project=self.project,
            version_number=self.version_number - 1
        ).first()

    def get_next_version(self):
        """Get the next version of this model."""
        return Model.objects.filter(
            project=self.project,
            version_number=self.version_number + 1
        ).first()

    def publish(self):
        """
        Publish this version as the active version.

        This will:
        1. Set this model's is_published to True
        2. Unpublish all other versions with the same name in the same project
        3. Only works if status is 'ready'

        Returns:
            bool: True if published successfully, False otherwise
        """
        if self.status != 'ready':
            return False

        # Unpublish all other versions with the same name in this project
        Model.objects.filter(
            project=self.project,
            name=self.name
        ).exclude(id=self.id).update(is_published=False)

        # Publish this version
        self.is_published = True
        self.save()

        return True

    def unpublish(self):
        """Unpublish this version."""
        self.is_published = False
        self.save()

    def get_task_status(self):
        """
        Get the status of the Django-Q task for this model.

        Returns:
            dict: Task status with state and info, or None if no task
        """
        if not self.task_id:
            return None

        from django_q.models import Task
        from django_q.tasks import result

        try:
            # Get task from Django-Q database
            task = Task.objects.filter(id=self.task_id).first()

            if not task:
                return {
                    'task_id': self.task_id,
                    'state': 'PENDING',  # Task not in database yet
                    'info': None,
                    'ready': False,
                    'successful': None,
                    'failed': None,
                }

            # Map Django-Q status to task states
            # Django-Q states: 'queued', 'started', 'failed', 'success'
            state_map = {
                'queued': 'PENDING',
                'started': 'STARTED',
                'failed': 'FAILURE',
                'success': 'SUCCESS',
            }

            state = state_map.get(task.func, 'PENDING')
            ready = task.stopped is not None
            successful = task.success if ready else None
            failed = (not task.success) if ready else None

            return {
                'task_id': self.task_id,
                'state': state,
                'info': task.result if ready else None,
                'ready': ready,
                'successful': successful,
                'failed': failed,
            }

        except Exception as e:
            # If task lookup fails, return basic info
            return {
                'task_id': self.task_id,
                'state': 'UNKNOWN',
                'info': str(e),
                'ready': False,
                'successful': None,
                'failed': None,
            }
