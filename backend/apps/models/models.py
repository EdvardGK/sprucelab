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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='models')
    name = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    ifc_schema = models.CharField(max_length=50, blank=True, null=True)  # IFC2X3, IFC4, etc.
    file_url = models.URLField(max_length=500, blank=True, null=True)  # Supabase Storage URL
    file_size = models.BigIntegerField(default=0, help_text="File size in bytes")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploading')
    version_number = models.IntegerField(default=1)
    parent_model = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='versions')
    is_published = models.BooleanField(default=False, help_text="Whether this version is the active/published version")

    # Metadata
    element_count = models.IntegerField(default=0)
    storey_count = models.IntegerField(default=0)
    system_count = models.IntegerField(default=0)
    processing_error = models.TextField(blank=True, null=True)

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
