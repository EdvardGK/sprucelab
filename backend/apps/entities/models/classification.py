"""
Classification models: NS3451 codes, ownership matrix, semantic types.
"""
from django.db import models
import uuid

from apps.core.disciplines import (
    ALL_DISCIPLINE_CHOICES,
    OWNERSHIP_LEVEL_CHOICES,
)


class NS3451Code(models.Model):
    """
    NS-3451 building part classification codes (Norwegian standard).

    Reference table loaded from NS-3451:2022 standard.
    Used for dropdown selection when mapping IFC types.
    """
    code = models.CharField(
        max_length=20,
        primary_key=True,
        help_text="NS-3451 code (e.g., '222' for columns, '231' for external walls)"
    )
    name = models.CharField(max_length=255, help_text="Norwegian name")
    name_en = models.CharField(max_length=255, blank=True, null=True, help_text="English name")
    guidance = models.TextField(blank=True, null=True, help_text="Usage guidance from standard")
    level = models.IntegerField(
        help_text="Hierarchy level (1=main category, 2=subcategory, 3=detail)"
    )
    parent_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Parent code for hierarchy"
    )

    class Meta:
        app_label = 'entities'
        db_table = 'ns3451_codes'
        ordering = ['code']
        verbose_name = 'NS-3451 Code'
        verbose_name_plural = 'NS-3451 Codes'

    def __str__(self):
        return f"{self.code} - {self.name}"


class NS3451OwnershipMatrix(models.Model):
    """
    Maps NS3451 codes to responsible disciplines (Sprint 1: The Gatekeeper).

    Defines which discipline "owns" which building parts:
    - Primary: Discipline must model this (e.g., RIV owns 32 HVAC)
    - Secondary: Discipline may model this for coordination
    - Reference: Discipline copies from primary owner (e.g., ARK shows RIV elements)

    Used by discipline_filter.py to auto-demote types outside model's responsibility.
    """
    # Discipline choices and ownership levels imported from apps.core.disciplines

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    ns3451_code = models.ForeignKey(
        'NS3451Code',
        on_delete=models.CASCADE,
        related_name='ownership_matrix',
        help_text="NS3451 building part code"
    )
    discipline = models.CharField(
        max_length=20,
        choices=ALL_DISCIPLINE_CHOICES,
        help_text="BIM discipline code"
    )
    ownership_level = models.CharField(
        max_length=20,
        choices=OWNERSHIP_LEVEL_CHOICES,
        help_text="Level of ownership for this discipline"
    )
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional guidance for this assignment"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'ns3451_ownership_matrix'
        unique_together = ['ns3451_code', 'discipline']
        ordering = ['ns3451_code', 'discipline']
        verbose_name = 'NS3451 Ownership Matrix'
        verbose_name_plural = 'NS3451 Ownership Matrix'
        indexes = [
            models.Index(fields=['discipline']),
            models.Index(fields=['ownership_level']),
        ]

    def __str__(self):
        return f"{self.ns3451_code.code} -> {self.discipline} ({self.ownership_level})"


class SemanticType(models.Model):
    """
    Canonical semantic type definitions based on PA0802/NS3451.

    Normalizes IFC classes to what elements ACTUALLY are, regardless of
    how they were modeled. For example:
    - IfcSlab used for carpet -> SemanticType 'EB' (Surface Covering)
    - IfcBeam used for railing rail -> SemanticType 'AR' (Railing)
    - IfcBuildingElementProxy -> needs manual classification

    Based on PA0802 TFM component codes and aligned with NS3451.
    """
    code = models.CharField(
        max_length=4,
        unique=True,
        help_text="PA0802 code: AB, AD, AV, etc."
    )
    name_no = models.CharField(max_length=100, help_text="Norwegian name")
    name_en = models.CharField(max_length=100, help_text="English name")
    category = models.CharField(
        max_length=50,
        help_text="Category: A-Structural, D-Openings, E-Cladding, etc."
    )

    # IFC mappings
    canonical_ifc_class = models.CharField(
        max_length=50,
        help_text="Primary expected IFC class: IfcBeam, IfcWall, etc."
    )
    alternative_ifc_classes = models.JSONField(
        default=list,
        blank=True,
        help_text="Alternative valid IFC classes: ['IfcBeamStandardCase']"
    )

    # NS3451 mappings
    suggested_ns3451_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="Suggested NS3451 codes: ['223', '2231']"
    )

    # Pattern matching for auto-detection
    name_patterns = models.JSONField(
        default=list,
        blank=True,
        help_text="Glob patterns for name matching: ['*beam*', '*bjelke*']"
    )

    # Metadata
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'entities'
        db_table = 'semantic_types'
        ordering = ['category', 'code']
        verbose_name = 'Semantic Type'
        verbose_name_plural = 'Semantic Types'

    def __str__(self):
        return f"{self.code} - {self.name_en}"


class SemanticTypeIFCMapping(models.Model):
    """
    Maps IFC classes to semantic types with context.

    Handles both:
    - Primary mappings (IfcBeam -> AB Beam, high confidence)
    - Misuse mappings (IfcSlab used for covering -> EB, low confidence)
    """
    semantic_type = models.ForeignKey(
        'SemanticType',
        on_delete=models.CASCADE,
        related_name='ifc_mappings'
    )
    ifc_class = models.CharField(
        max_length=50,
        help_text="IFC class: IfcWall, IfcBuildingElementProxy, etc."
    )
    predefined_type = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Optional PredefinedType filter"
    )

    is_primary = models.BooleanField(
        default=False,
        help_text="True if this is the expected/correct IFC class"
    )
    is_common_misuse = models.BooleanField(
        default=False,
        help_text="True if this IFC class is commonly misused for this type"
    )
    confidence_hint = models.FloatField(
        default=0.5,
        help_text="Confidence when auto-detected via this mapping (0.0-1.0)"
    )
    note = models.TextField(
        blank=True,
        null=True,
        help_text="Explanation of this mapping"
    )

    class Meta:
        app_label = 'entities'
        db_table = 'semantic_type_ifc_mappings'
        unique_together = ['semantic_type', 'ifc_class', 'predefined_type']
        indexes = [
            models.Index(fields=['ifc_class']),
        ]
        verbose_name = 'Semantic Type IFC Mapping'
        verbose_name_plural = 'Semantic Type IFC Mappings'

    def __str__(self):
        primary = " (primary)" if self.is_primary else ""
        misuse = " [misuse]" if self.is_common_misuse else ""
        return f"{self.ifc_class} -> {self.semantic_type.code}{primary}{misuse}"
