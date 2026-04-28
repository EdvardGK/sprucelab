"""
IFC Model and related models for BIM Coordinator Platform.
"""
from django.conf import settings
from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid
import re

from apps.core.disciplines import (
    MODEL_DISCIPLINE_CHOICES,
    DISCIPLINE_COLORS,
)


class SourceFile(models.Model):
    """
    Layer 0: format-agnostic file record. Every uploaded file has one.

    SourceFile is the universal entry point for the data foundation. Format
    detection, checksum, and version tracking happen here. Downstream models
    (e.g. `Model` for IFC) reference a SourceFile.

    Dedup key: (project, checksum_sha256). Two uploads of the same bytes into
    the same project produce one SourceFile with version_number bumped.
    """

    FORMAT_CHOICES = [
        ('ifc', 'IFC'),
        ('las', 'LAS Point Cloud'),
        ('laz', 'LAZ Point Cloud'),
        ('e57', 'E57 Point Cloud'),
        ('dwg', 'AutoCAD DWG'),
        ('dxf', 'AutoCAD DXF'),
        ('pdf', 'PDF'),
        ('docx', 'Word'),
        ('xlsx', 'Excel'),
        ('pptx', 'PowerPoint'),
        ('csv', 'CSV'),
        ('json', 'JSON'),
        ('xml', 'XML'),
        ('svg', 'SVG'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE, related_name='source_files'
    )

    original_filename = models.CharField(max_length=255)
    file_url = models.URLField(max_length=500, blank=True, null=True)
    file_size = models.BigIntegerField(default=0, help_text="Bytes")
    checksum_sha256 = models.CharField(max_length=64, blank=True, db_index=True)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, db_index=True)
    mime_type = models.CharField(max_length=100, blank=True)

    version_number = models.IntegerField(default=1)
    parent_file = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='versions',
    )
    is_current = models.BooleanField(default=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='uploaded_source_files',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'source_files'
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['project', 'is_current']),
        ]

    def __str__(self):
        return f"{self.original_filename} ({self.format} v{self.version_number})"

    @staticmethod
    def detect_format(filename: str) -> str:
        """Pick a format choice from the filename extension."""
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        for code, _ in SourceFile.FORMAT_CHOICES:
            if code == ext:
                return code
        return 'other'


class ExtractionRun(models.Model):
    """
    Layer 1: a single extraction attempt over a SourceFile.

    Replaces ProcessingReport. Status transitions pending -> running ->
    completed|failed. Carries the structured log_entries and quality_report
    that Phase 1 IFC hardening already produces.

    A SourceFile may have many ExtractionRuns (re-extraction, format upgrades,
    schema fixes). The latest completed run is the live truth for queries.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_file = models.ForeignKey(
        SourceFile, on_delete=models.CASCADE, related_name='extraction_runs'
    )

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    discovered_crs = models.CharField(max_length=100, blank=True, null=True)
    crs_source = models.CharField(
        max_length=50, blank=True, null=True,
        help_text="Where the CRS came from (IfcMapConversion | filename | manual)",
    )
    crs_confidence = models.FloatField(null=True, blank=True)
    discovered_units = models.JSONField(
        default=dict, blank=True,
        help_text='{"length": "mm", "area": "m2", "angle": "deg"}',
    )

    quality_report = models.JSONField(
        default=dict, blank=True,
        help_text='{"total_elements": N, "typed": N, "untyped": N, "dropped": [...]}',
    )
    log_entries = models.JSONField(
        default=list, blank=True,
        help_text='List of {ts, level, stage, message, details} entries',
    )

    error_message = models.TextField(blank=True, null=True)
    extractor_version = models.CharField(max_length=100, blank=True)
    task_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'extraction_runs'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['source_file', '-started_at']),
        ]

    def __str__(self):
        return f"{self.source_file.original_filename} :: {self.status} ({self.started_at:%Y-%m-%d %H:%M})"


def infer_discipline_from_filename(filename: str) -> str | None:
    """
    Infer discipline from IFC filename patterns.

    Common patterns:
    - ST28_RIV_*.ifc → RIV (Mechanical)
    - ProjectName_ARK_*.ifc → ARK (Architecture)
    - *_RIVp*.ifc → RIVp (Plumbing)
    - *-RIB-*.ifc → RIB (Structural)

    Sub-disciplines checked before parents (RIVp before RIV).
    Returns discipline code or None if not inferable.
    """
    if not filename:
        return None

    upper_name = filename.upper()

    # Longer codes first so sub-disciplines match before parents
    discipline_patterns = [
        (r'[_\-]RIVARME[_\-\.]',  'RIvarme'),
        (r'[_\-]RIKULDE[_\-\.]',  'RIkulde'),
        (r'[_\-]RIVSPR[_\-\.]',   'RIVspr'),
        (r'[_\-]RIVV[_\-\.]',     'RIVv'),
        (r'[_\-]RIVP[_\-\.]',     'RIVp'),
        (r'[_\-]RIBP[_\-\.]',     'RIBp'),
        (r'[_\-]RIBYFY[_\-\.]',   'RIByfy'),
        (r'[_\-]RIBR[_\-\.]',     'RIBr'),
        (r'[_\-]LARK[_\-\.]',     'LARK'),
        (r'[_\-]ARK[_\-\.]',      'ARK'),
        (r'[_\-]RIB[_\-\.]',      'RIB'),
        (r'[_\-]RIV[_\-\.]',      'RIV'),
        (r'[_\-]RIE[_\-\.]',      'RIE'),
        (r'[_\-]RIG[_\-\.]',      'RIG'),
        (r'[_\-]RIA[_\-\.]',      'RIA'),
        (r'[_\-]RIM[_\-\.]',      'RIM'),
    ]

    for pattern, discipline in discipline_patterns:
        if re.search(pattern, upper_name):
            return discipline

    return None


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

    FRAGMENTS_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('generating', 'Generating'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    # Discipline choices and colors imported from apps.core.disciplines

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='models')
    name = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    ifc_schema = models.CharField(max_length=50, blank=True, null=True)  # IFC2X3, IFC4, etc.
    file_url = models.URLField(max_length=500, blank=True, null=True)  # Supabase Storage URL
    file_size = models.BigIntegerField(default=0, help_text="File size in bytes")
    checksum_sha256 = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text="SHA-256 checksum of the uploaded file (for integrity verification)"
    )

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
    fragments_status = models.CharField(
        max_length=20,
        choices=FRAGMENTS_STATUS_CHOICES,
        default='pending',
        help_text="Fragment generation status"
    )
    fragments_error = models.TextField(
        blank=True,
        null=True,
        help_text="Error message if fragment generation failed"
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

    # Layer 0 link: every Model is derived from a SourceFile. Nullable for now
    # because the data migration backfills existing rows; new uploads always
    # populate it.
    source_file = models.ForeignKey(
        'SourceFile', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='derived_models',
    )

    # Phase 1: identity attribution. Versioning audit log (ModelEvent) arrives in Phase 2.
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='uploaded_models',
    )

    # === Forking (scenarios, analysis, design alternatives) ===
    FORK_TYPE_CHOICES = [
        ('analysis', 'Analysis'),
        ('lca_scenario', 'LCA Scenario'),
        ('design_option', 'Design Option'),
        ('client_review', 'Client Review'),
        ('archive', 'Archive Snapshot'),
    ]

    forked_from = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='forks',
        help_text="Source model this was forked from"
    )
    fork_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Human-readable fork name (e.g., 'LCA Timber Alternative')"
    )
    fork_type = models.CharField(
        max_length=20,
        choices=FORK_TYPE_CHOICES,
        blank=True,
        null=True,
        help_text="Purpose of this fork"
    )
    fork_description = models.TextField(
        blank=True,
        null=True,
        help_text="Description of what this fork explores/changes"
    )
    forked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this fork was created"
    )

    # IFC file timestamp (from IfcOwnerHistory)
    ifc_timestamp = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Creation/modification date from IFC file (IfcOwnerHistory)"
    )

    # Version diff summary
    version_diff = models.JSONField(
        null=True,
        blank=True,
        help_text="Diff summary: {entities: {created: N, updated: N, removed: N}}"
    )

    # Metadata (aggregate stats - element details queried via FastAPI)
    element_count = models.IntegerField(default=0)
    storey_count = models.IntegerField(default=0)
    system_count = models.IntegerField(default=0)
    type_count = models.IntegerField(default=0, help_text="Number of IFC type definitions")
    material_count = models.IntegerField(default=0, help_text="Number of unique materials")
    type_summary = models.JSONField(
        null=True,
        blank=True,
        help_text="Type breakdown: [{ifc_type: 'IfcWall', count: 150}, ...]"
    )
    processing_error = models.TextField(blank=True, null=True)

    # === Coordinate Systems (GIS + Local) ===
    # GIS coordinates (for infrastructure, surveying)
    gis_basepoint_x = models.FloatField(
        null=True,
        blank=True,
        help_text="GIS X coordinate (Easting) - typically UTM or national grid"
    )
    gis_basepoint_y = models.FloatField(
        null=True,
        blank=True,
        help_text="GIS Y coordinate (Northing) - typically UTM or national grid"
    )
    gis_basepoint_z = models.FloatField(
        null=True,
        blank=True,
        help_text="GIS Z coordinate (elevation above sea level) in meters"
    )
    gis_crs = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Coordinate Reference System (e.g., 'EPSG:25832' for UTM Zone 32N)"
    )

    # Local coordinates (for buildings, typical 0,0,0 at project basepoint)
    local_basepoint_x = models.FloatField(
        default=0,
        help_text="Local X coordinate - typically 0 at project basepoint"
    )
    local_basepoint_y = models.FloatField(
        default=0,
        help_text="Local Y coordinate - typically 0 at project basepoint"
    )
    local_basepoint_z = models.FloatField(
        default=0,
        help_text="Local Z coordinate - typically 0 at project basepoint"
    )

    # Transformation matrix (4x4 affine transform) for converting GIS ↔ Local
    transformation_matrix = models.JSONField(
        null=True,
        blank=True,
        help_text="4x4 transformation matrix for GIS to Local coordinate conversion"
    )

    # === Discipline Assignment (Sprint 1: The Gatekeeper) ===
    discipline = models.CharField(
        max_length=20,
        choices=MODEL_DISCIPLINE_CHOICES,
        blank=True,
        null=True,
        help_text="Model discipline - auto-inferred from filename, can be overridden"
    )
    is_primary_for_discipline = models.BooleanField(
        default=False,
        help_text="This is THE authoritative model for this discipline (e.g., main ARK model = room source of truth)"
    )

    # Celery task tracking
    task_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Celery task ID for async processing"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'models'
        ordering = ['-created_at']
        unique_together = ['project', 'name', 'version_number']
        indexes = [
            models.Index(fields=['discipline']),
            models.Index(fields=['project', 'discipline']),
            models.Index(fields=['is_primary_for_discipline']),
        ]

    def save(self, *args, **kwargs):
        """Auto-infer discipline from filename if not already set."""
        if not self.discipline and self.original_filename:
            self.discipline = infer_discipline_from_filename(self.original_filename)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} (v{self.version_number})"

    def get_first_version_created_at(self):
        """
        Return the created_at of the first version of this model (v1).

        Used to show users "when this model first hit the platform", independent
        of which version is currently displayed. For v1 rows this is self.created_at
        without a database query.
        """
        if self.version_number == 1 or self.parent_model_id is None:
            return self.created_at
        original_ts = Model.objects.filter(
            project_id=self.project_id,
            name=self.name,
            version_number=1,
        ).values_list('created_at', flat=True).first()
        return original_ts or self.created_at

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

    @property
    def is_fork(self):
        """Check if this model is a fork."""
        return self.forked_from is not None

    @property
    def discipline_color(self):
        """Get the color for this model's discipline (for frontend 'ear' indicator)."""
        if self.discipline:
            return DISCIPLINE_COLORS.get(self.discipline, '#6B7280')  # Gray fallback
        return None

    def set_as_primary(self):
        """
        Set this model as the primary model for its discipline in the project.

        This will:
        1. Unset is_primary_for_discipline on other models with same discipline in project
        2. Set this model's is_primary_for_discipline to True

        Returns:
            bool: True if set successfully, False if no discipline assigned
        """
        if not self.discipline:
            return False

        # Unset primary flag on other models with same discipline in this project
        Model.objects.filter(
            project=self.project,
            discipline=self.discipline,
            is_primary_for_discipline=True
        ).exclude(id=self.id).update(is_primary_for_discipline=False)

        self.is_primary_for_discipline = True
        self.save()
        return True

    def get_forks(self):
        """Get all forks of this model."""
        return Model.objects.filter(forked_from=self).order_by('-forked_at')

    def create_fork(self, fork_name, fork_type='analysis', fork_description=None, copy_entities=False):
        """
        Create a fork of this model.

        Args:
            fork_name: Human-readable name for the fork
            fork_type: One of analysis, lca_scenario, design_option, client_review, archive
            fork_description: Optional description
            copy_entities: If True, copies all entities (editable fork). If False, view-only fork.

        Returns:
            The new forked Model instance
        """
        from django.utils import timezone

        fork = Model.objects.create(
            project=self.project,
            name=f"{self.name} ({fork_name})",
            original_filename=self.original_filename,
            ifc_schema=self.ifc_schema,
            file_url=self.file_url,
            file_size=self.file_size,
            fragments_url=self.fragments_url,
            fragments_size_mb=self.fragments_size_mb,
            fragments_generated_at=self.fragments_generated_at,
            status='ready',
            parsing_status='parsed',
            geometry_status=self.geometry_status,
            validation_status=self.validation_status,
            version_number=1,  # Forks start at v1
            element_count=self.element_count,
            storey_count=self.storey_count,
            system_count=self.system_count,
            # Coordinate systems
            gis_basepoint_x=self.gis_basepoint_x,
            gis_basepoint_y=self.gis_basepoint_y,
            gis_basepoint_z=self.gis_basepoint_z,
            gis_crs=self.gis_crs,
            local_basepoint_x=self.local_basepoint_x,
            local_basepoint_y=self.local_basepoint_y,
            local_basepoint_z=self.local_basepoint_z,
            transformation_matrix=self.transformation_matrix,
            # Fork metadata
            forked_from=self,
            fork_name=fork_name,
            fork_type=fork_type,
            fork_description=fork_description,
            forked_at=timezone.now(),
        )

        if copy_entities:
            self._copy_entities_to_fork(fork)

        return fork

    def _copy_entities_to_fork(self, fork):
        """Copy all entities from this model to the fork."""
        from apps.entities.models import IFCEntity, PropertySet

        # Bulk copy entities
        entities = list(self.entities.all())
        entity_map = {}  # old_id -> new_entity

        for entity in entities:
            old_id = entity.id
            entity.pk = None  # Reset PK for new insert
            entity.id = None
            entity.model = fork
            entity.save()
            entity_map[old_id] = entity

        # Copy property sets
        for old_id, new_entity in entity_map.items():
            old_entity_psets = PropertySet.objects.filter(entity_id=old_id)
            for pset in old_entity_psets:
                pset.pk = None
                pset.id = None
                pset.entity = new_entity
                pset.save()

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
