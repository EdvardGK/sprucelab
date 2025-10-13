"""
Project models for BIM Coordinator Platform.
"""
from django.db import models
import uuid


class Project(models.Model):
    """
    Top-level project container for IFC models.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def get_model_count(self):
        """Get number of models in this project."""
        return self.models.count()

    def get_latest_model(self):
        """Get the most recent model version."""
        return self.models.order_by('-version_number').first()

    def get_element_count(self):
        """Get total number of elements across all models."""
        from apps.entities.models import IFCEntity
        model_ids = self.models.values_list('id', flat=True)
        return IFCEntity.objects.filter(model_id__in=model_ids).count()

    # BEP (BIM Execution Plan) methods
    def get_active_bep(self):
        """Get currently active BEP for this project."""
        return self.beps.filter(status='active').first()

    def has_bep(self):
        """Check if project has an active BEP."""
        return self.beps.filter(status='active').exists()

    def get_bep_count(self):
        """Get number of BEPs (all versions)."""
        return self.beps.count()

    def get_bep_versions(self):
        """Get all BEP versions for this project."""
        return self.beps.all().order_by('-version')
