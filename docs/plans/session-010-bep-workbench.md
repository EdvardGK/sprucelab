# Session 010 Planning: BEP Workbench Implementation

**Date**: 2025-10-13
**Session**: 010
**Focus**: BIM Execution Plan (BEP) Workbench - ISO 19650 & buildingSMART Norway POFIN
**Status**: Planning Phase

---

## Executive Summary

### The Problem

**Current State** (Session 009):
- ✅ Script execution system works
- ✅ QTO and MMI dashboards exist
- ❌ MMI analyzer uses incorrect scale (1-7 instead of 100/300/350/400/500)
- ❌ All validation rules are hardcoded
- ❌ No project-specific standards management
- ❌ Scripts can't validate against project requirements

**Root Cause**: No project-level configuration system. Every project has different:
- MMI scale definitions (some use 100/300/400/500, others use 100/300/350/400/500)
- IFC requirements (schema, MVD, coordinate systems)
- Property set requirements (which Psets are required at which MMI level?)
- Naming conventions (file naming, element classification)
- Validation rules (what constitutes an "error" vs "warning"?)

**The Solution**: **BEP (BIM Execution Plan) Workbench**

A project-centric configuration system where:
1. Each project has a BEP that defines all standards and requirements
2. Analysis scripts (MMI, QTO, validation) check models **against the project's BEP**
3. BEP follows ISO 19650 and buildingSMART Norway POFIN framework
4. Users can start from templates (POFIN Standard, Infrastructure, etc.)
5. BEP is versioned and auditable

---

## Vision & Goals

### Strategic Vision

> "The BEP is the source of truth for all project requirements. Every validation, every analysis, every report should reference the project's BEP. This makes the platform truly project-centric and standards-compliant."

### Core Principles

1. **ISO 19650 Compliance**: Follow international BIM information management standards
2. **POFIN Framework**: Implement buildingSMART Norway's national framework
3. **Project-Centric**: Projects own their standards, not the platform
4. **Template-Driven**: Start from standards, customize as needed
5. **Auditable**: Track who changed what when
6. **Collaborative**: Team members can view and discuss BEP requirements

### Session Goals

**Primary Goal**: Design and implement the BEP database schema and configuration system

**Success Criteria**:
- ✅ Database schema designed and migrated (7+ new tables)
- ✅ BEP CRUD API endpoints working
- ✅ Project model extended with BEP relationship
- ✅ Management command to load POFIN templates
- ✅ Django admin interfaces for BEP configuration
- ⏳ MMI analyzer rewritten to use BEP (stretch goal)

---

## ISO 19650 & POFIN Framework Overview

### ISO 19650 Information Management

**ISO 19650** is the international standard for managing information over the whole lifecycle of a built asset using building information modelling (BIM).

**Key Documents in ISO 19650**:

1. **OIR (Organizational Information Requirements)**
   - Owner's long-term requirements
   - Not directly in scope for this platform

2. **EIR (Exchange Information Requirements)** ⭐
   - Client/Employer's project-specific information requirements
   - Defines what information is needed, when, and in what format
   - **Our focus**: This is what we'll store and manage

3. **BEP (BIM Execution Plan)** ⭐⭐⭐
   - Delivery team's plan for meeting the EIR
   - Two types:
     - **Pre-appointment BEP**: How we'll meet your requirements
     - **Post-appointment BEP**: Detailed delivery plan
   - **Our focus**: This is the core of our system

4. **AIR (Asset Information Requirements)**
   - Operations/FM requirements
   - Future scope

**ISO 19650 Workflow**:
```
Client defines EIR → Delivery team proposes BEP → Appointment → BEP execution → Information delivery
```

**For our platform**: We combine EIR and BEP into a single "BEP Configuration" that defines both requirements and how we'll validate them.

---

### POFIN Framework (buildingSMART Norge)

**POFIN** (Prosjekt og Forvaltning i Norge) is buildingSMART Norway's implementation of ISO 19650 for the Norwegian market.

**Key Features**:
1. **Norwegian MMI Scale**: 100, 200, 300, 350, 400, 500 (not 1-7!)
2. **Discipline Codes**: ARK, RIV, ELEKT, VVS, etc.
3. **NS Standards Integration**: NS 3451 classification system
4. **Common Data Environment (CDE)**: File organization structure
5. **Model Delivery Specifications**: What to deliver at each milestone

**openBIM Harmony**: European framework that POFIN implements
- Ready-to-use templates for EIR, BEP, TIDP, MIDP
- Based on ISO 19650 and CEN/TR 17654
- National chapters (Norway, Denmark, Benelux, Portugal) adapt for their markets

**For our platform**:
- We implement POFIN's MMI scale and requirements
- Provide templates based on POFIN guidelines
- Support Norwegian naming conventions and classifications

---

## Database Schema Design

### Overview

We'll add **7 new tables** to support BEP configuration:

```
projects (existing)
    ↓
bep_configurations (NEW) ← The main BEP document
    ↓
├─ technical_requirements (NEW) ← IFC schema, coordinates, units
├─ mmi_scale_definitions (NEW) ← Project-specific MMI levels
├─ naming_conventions (NEW) ← File/element naming rules
├─ required_property_sets (NEW) ← Which Psets are required
├─ validation_rules (NEW) ← Quality control rules
└─ submission_milestones (NEW) ← Delivery schedule
```

---

### Table 1: bep_configurations

**Purpose**: Main BEP document for a project

```python
class BEPConfiguration(models.Model):
    """BIM Execution Plan configuration for a project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='beps')

    # Versioning
    version = models.IntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('active', 'Active'),
            ('archived', 'Archived'),
        ],
        default='draft'
    )

    # Metadata
    name = models.CharField(max_length=255, default='BIM Execution Plan')
    description = models.TextField(blank=True)

    # ISO 19650 Documents
    eir_document_url = models.URLField(blank=True, null=True, help_text="Link to EIR PDF/document")
    bep_document_url = models.URLField(blank=True, null=True, help_text="Link to BEP PDF/document")

    # Framework
    framework = models.CharField(
        max_length=50,
        choices=[
            ('pofin', 'POFIN (buildingSMART Norge)'),
            ('iso19650', 'ISO 19650 Generic'),
            ('custom', 'Custom'),
        ],
        default='pofin'
    )

    # Common Data Environment structure
    cde_structure = models.JSONField(
        default=dict,
        help_text="CDE folder structure (WIP/Shared/Published/Archive)"
    )

    # Audit
    created_by = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bep_configurations'
        ordering = ['-created_at']
        unique_together = [['project', 'version']]

    def __str__(self):
        return f"{self.project.name} - BEP v{self.version} ({self.status})"

    def activate(self):
        """Activate this BEP and archive previous active BEPs."""
        # Archive all other active BEPs for this project
        BEPConfiguration.objects.filter(
            project=self.project,
            status='active'
        ).update(status='archived')

        # Activate this one
        self.status = 'active'
        self.activated_at = timezone.now()
        self.save()
```

**Key Design Decisions**:
- One project can have multiple BEPs (versioning)
- Only one BEP can be "active" at a time
- Archive old versions when new one is activated
- Support multiple frameworks (POFIN, ISO 19650, custom)
- Link to external EIR/BEP documents (PDFs)

---

### Table 2: technical_requirements

**Purpose**: IFC technical specifications (schema, coordinates, units, etc.)

```python
class TechnicalRequirement(models.Model):
    """Technical requirements for IFC models in this project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.OneToOneField(BEPConfiguration, on_delete=models.CASCADE, related_name='technical_requirements')

    # IFC Requirements
    ifc_schema = models.CharField(
        max_length=20,
        choices=[
            ('IFC2X3', 'IFC 2x3'),
            ('IFC4', 'IFC 4.0'),
            ('IFC4X3', 'IFC 4.3'),
        ],
        default='IFC4'
    )

    model_view_definition = models.CharField(
        max_length=100,
        blank=True,
        help_text="MVD name (e.g., 'CoordinationView 2.0', 'ReferenceView')"
    )

    # Coordinate System
    coordinate_system_name = models.CharField(
        max_length=100,
        default='EPSG:25833',  # ETRS89 / UTM zone 33N (Norway)
        help_text="EPSG code or coordinate system name"
    )
    coordinate_system_description = models.TextField(blank=True)

    # Units
    length_unit = models.CharField(
        max_length=20,
        choices=[
            ('METRE', 'Meter'),
            ('MILLIMETRE', 'Millimeter'),
        ],
        default='METRE'
    )
    area_unit = models.CharField(max_length=20, default='SQUARE_METRE')
    volume_unit = models.CharField(max_length=20, default='CUBIC_METRE')

    # Precision
    geometry_tolerance = models.FloatField(
        default=0.001,
        help_text="Geometric tolerance in length units (e.g., 0.001m = 1mm)"
    )

    # File Requirements
    max_file_size_mb = models.IntegerField(default=500, help_text="Maximum IFC file size in MB")

    # Additional Requirements
    requirements_json = models.JSONField(
        default=dict,
        help_text="Additional technical requirements (custom fields)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'technical_requirements'

    def __str__(self):
        return f"Technical Requirements - {self.bep.project.name}"
```

**Key Design Decisions**:
- One-to-one with BEP (each BEP has exactly one technical requirements)
- Norwegian defaults (EPSG:25833, meters)
- Extensible with requirements_json for custom fields
- MVD support for IFC subsets

---

### Table 3: mmi_scale_definitions

**Purpose**: Define project-specific MMI levels (the correct Norwegian way!)

```python
class MMIScaleDefinition(models.Model):
    """Definition of an MMI level for this project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.ForeignKey(BEPConfiguration, on_delete=models.CASCADE, related_name='mmi_scale')

    # MMI Level (Norwegian scale)
    mmi_level = models.IntegerField(
        choices=[
            (100, 'MMI 100'),
            (200, 'MMI 200'),
            (300, 'MMI 300'),
            (350, 'MMI 350'),
            (400, 'MMI 400'),
            (500, 'MMI 500'),
        ]
    )

    # Human-readable names
    name = models.CharField(
        max_length=100,
        help_text="E.g., 'Concept Design', 'Coordination Design', 'Production Ready'"
    )
    description = models.TextField(
        help_text="What this MMI level means for THIS project"
    )

    # Geometry Requirements
    geometry_requirements = models.JSONField(
        default=dict,
        help_text="""
        Example:
        {
            "detail_level": "symbolic|approximate|detailed|as_built",
            "min_vertex_count": 8,
            "requires_3d": true,
            "collision_ready": false
        }
        """
    )

    # Information Requirements
    information_requirements = models.JSONField(
        default=dict,
        help_text="""
        Example:
        {
            "requires_name": true,
            "requires_description": false,
            "requires_classification": true,
            "requires_material": true,
            "requires_system_membership": false,
            "min_property_count": 5
        }
        """
    )

    # Discipline-specific rules
    discipline_specific_rules = models.JSONField(
        default=dict,
        help_text="""
        Example:
        {
            "ARK": {"requires_loadbearing": true},
            "RIV": {"requires_structural_analysis": true},
            "ELEKT": {"requires_circuit_info": true}
        }
        """
    )

    # Usage tracking
    applies_to_disciplines = models.JSONField(
        default=list,
        help_text="List of discipline codes this MMI applies to ['ARK', 'RIV', 'ELEKT']"
    )

    # Order
    display_order = models.IntegerField(default=0, help_text="Sort order in UI")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mmi_scale_definitions'
        ordering = ['bep', 'mmi_level']
        unique_together = [['bep', 'mmi_level']]

    def __str__(self):
        return f"MMI {self.mmi_level}: {self.name}"
```

**Key Design Decisions**:
- MMI levels are **100/200/300/350/400/500** (Norwegian standard, NOT 1-7!)
- Each project defines what each MMI level means
- Separate geometry and information requirements
- Discipline-specific rules (different for ARK vs RIV vs ELEKT)
- Flexible JSON fields for custom requirements

**Example MMI Definitions** (POFIN Standard):

```json
// MMI 100 - Concept/Sketch
{
    "mmi_level": 100,
    "name": "Concept Design",
    "description": "Preliminary sketches for early design exploration",
    "geometry_requirements": {
        "detail_level": "symbolic",
        "requires_3d": false,
        "min_vertex_count": 0
    },
    "information_requirements": {
        "requires_name": false,
        "requires_description": false,
        "min_property_count": 0
    }
}

// MMI 300 - Coordination Design
{
    "mmi_level": 300,
    "name": "Coordination Design",
    "description": "Coordinated within discipline, ready for clash detection",
    "geometry_requirements": {
        "detail_level": "approximate",
        "requires_3d": true,
        "collision_ready": true,
        "min_vertex_count": 20
    },
    "information_requirements": {
        "requires_name": true,
        "requires_classification": true,
        "requires_material": true,
        "min_property_count": 5
    }
}

// MMI 400 - Production Ready
{
    "mmi_level": 400,
    "name": "Production Ready",
    "description": "Detailed for construction, all feedback approved",
    "geometry_requirements": {
        "detail_level": "detailed",
        "requires_3d": true,
        "collision_ready": true,
        "min_vertex_count": 50
    },
    "information_requirements": {
        "requires_name": true,
        "requires_description": true,
        "requires_classification": true,
        "requires_material": true,
        "requires_system_membership": true,
        "min_property_count": 15
    }
}
```

---

### Table 4: naming_conventions

**Purpose**: Define naming standards for files, elements, classifications

```python
class NamingConvention(models.Model):
    """Naming convention rule for this project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.ForeignKey(BEPConfiguration, on_delete=models.CASCADE, related_name='naming_conventions')

    # Rule category
    category = models.CharField(
        max_length=50,
        choices=[
            ('file_naming', 'File Naming'),
            ('element_naming', 'Element Naming'),
            ('layer_naming', 'Layer Naming'),
            ('classification', 'Classification System'),
            ('discipline_code', 'Discipline Code'),
        ]
    )

    # Rule definition
    name = models.CharField(max_length=100, help_text="Rule name")
    description = models.TextField(help_text="What this rule enforces")

    # Pattern (regex or template)
    pattern = models.CharField(
        max_length=500,
        help_text="Regex pattern or template string (e.g., '{project}_{discipline}_{type}_{number}.ifc')"
    )
    pattern_type = models.CharField(
        max_length=20,
        choices=[
            ('regex', 'Regular Expression'),
            ('template', 'Template String'),
        ],
        default='template'
    )

    # Examples
    examples = models.JSONField(
        default=list,
        help_text="Array of example valid names: ['ARK-001_Building_A.ifc', 'RIV-002_Foundation.ifc']"
    )

    # Discipline-specific
    applies_to_disciplines = models.JSONField(
        default=list,
        help_text="Empty = all disciplines. ['ARK', 'RIV'] = only those"
    )

    # Validation
    is_required = models.BooleanField(default=True, help_text="Must pass this check?")
    error_message = models.TextField(
        default="Name does not match project naming convention",
        help_text="Error message to show when validation fails"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'naming_conventions'
        ordering = ['bep', 'category']

    def __str__(self):
        return f"{self.category}: {self.name}"

    def validate_name(self, name: str) -> Tuple[bool, str]:
        """Validate a name against this convention."""
        import re

        if self.pattern_type == 'regex':
            if not re.match(self.pattern, name):
                return False, self.error_message
        elif self.pattern_type == 'template':
            # Template validation logic (future)
            pass

        return True, ""
```

**Example Naming Conventions**:

```json
// File naming (POFIN style)
{
    "category": "file_naming",
    "name": "IFC File Naming",
    "pattern": "^[A-Z]{3}-\\d{3}_[A-Za-z0-9_-]+\\.ifc$",
    "pattern_type": "regex",
    "examples": [
        "ARK-001_Building_A.ifc",
        "RIV-002_Foundation.ifc",
        "ELEKT-001_Power_Distribution.ifc"
    ]
}

// Classification (NS 3451)
{
    "category": "classification",
    "name": "NS 3451 Classification",
    "description": "Norwegian classification system for building elements",
    "pattern": "^\\d{2}\\.\\d{2}\\.\\d{2}$",
    "examples": ["21.11.10", "23.13.21"]
}
```

---

### Table 5: required_property_sets

**Purpose**: Define which Psets are required for which IFC types at which MMI levels

```python
class RequiredPropertySet(models.Model):
    """Required property set for a specific IFC type at a specific MMI level."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.ForeignKey(BEPConfiguration, on_delete=models.CASCADE, related_name='required_property_sets')

    # Scope
    ifc_type = models.CharField(
        max_length=50,
        help_text="IFC type (e.g., 'IfcWall', 'IfcDoor'). Use '*' for all types."
    )
    mmi_level = models.IntegerField(
        help_text="Minimum MMI level where this Pset is required"
    )

    # Property Set
    pset_name = models.CharField(
        max_length=100,
        help_text="Property set name (e.g., 'Pset_WallCommon', 'Pset_DoorCommon')"
    )

    # Required Properties
    required_properties = models.JSONField(
        default=list,
        help_text="""
        Array of required property definitions:
        [
            {
                "name": "LoadBearing",
                "type": "IfcBoolean",
                "validation": {"required": true}
            },
            {
                "name": "FireRating",
                "type": "IfcLabel",
                "validation": {"required": true, "pattern": "^(REI|EI)\\d+$"}
            }
        ]
        """
    )

    # Optional Properties
    optional_properties = models.JSONField(
        default=list,
        help_text="Array of property names that are optional but recommended"
    )

    # Discipline-specific
    applies_to_disciplines = models.JSONField(
        default=list,
        help_text="Empty = all disciplines"
    )

    # Validation
    is_required = models.BooleanField(default=True)
    severity = models.CharField(
        max_length=20,
        choices=[
            ('error', 'Error'),
            ('warning', 'Warning'),
            ('info', 'Info'),
        ],
        default='error'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'required_property_sets'
        ordering = ['bep', 'ifc_type', 'mmi_level']

    def __str__(self):
        return f"{self.ifc_type} → {self.pset_name} (MMI {self.mmi_level}+)"
```

**Example Property Requirements**:

```json
// IfcWall at MMI 300+
{
    "ifc_type": "IfcWall",
    "mmi_level": 300,
    "pset_name": "Pset_WallCommon",
    "required_properties": [
        {
            "name": "LoadBearing",
            "type": "IfcBoolean",
            "validation": {"required": true}
        },
        {
            "name": "IsExternal",
            "type": "IfcBoolean",
            "validation": {"required": true}
        }
    ],
    "optional_properties": ["FireRating", "AcousticRating"]
}

// IfcDoor at MMI 400+
{
    "ifc_type": "IfcDoor",
    "mmi_level": 400,
    "pset_name": "Pset_DoorCommon",
    "required_properties": [
        {
            "name": "FireRating",
            "type": "IfcLabel",
            "validation": {
                "required": true,
                "pattern": "^(EI|REI)\\d+(-\\w+)?$"
            }
        },
        {
            "name": "HandicapAccessible",
            "type": "IfcBoolean",
            "validation": {"required": true}
        }
    ]
}
```

---

### Table 6: validation_rules

**Purpose**: Define quality control rules for model validation

```python
class ValidationRule(models.Model):
    """Validation rule for quality control."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.ForeignKey(BEPConfiguration, on_delete=models.CASCADE, related_name='validation_rules')

    # Rule identification
    rule_code = models.CharField(
        max_length=50,
        help_text="Unique code (e.g., 'GUID-001', 'GEOM-002')"
    )
    name = models.CharField(max_length=100, help_text="Rule name")
    description = models.TextField(help_text="What this rule checks")

    # Rule type
    rule_type = models.CharField(
        max_length=50,
        choices=[
            ('guid', 'GUID Validation'),
            ('geometry', 'Geometry Validation'),
            ('property', 'Property Validation'),
            ('naming', 'Naming Convention'),
            ('classification', 'Classification'),
            ('relationship', 'Relationship'),
            ('clash', 'Clash Detection'),
            ('custom', 'Custom Script'),
        ]
    )

    # Severity
    severity = models.CharField(
        max_length=20,
        choices=[
            ('error', 'Error - Must fix'),
            ('warning', 'Warning - Should fix'),
            ('info', 'Info - Nice to have'),
        ],
        default='error'
    )

    # Rule definition (how to check)
    rule_definition = models.JSONField(
        default=dict,
        help_text="""
        Rule logic definition. Structure depends on rule_type:

        For 'guid':
        {
            "check": "uniqueness",
            "allow_duplicates": false
        }

        For 'geometry':
        {
            "check": "has_3d_geometry",
            "min_vertex_count": 8,
            "applies_to_types": ["IfcWall", "IfcSlab"]
        }

        For 'property':
        {
            "check": "has_property",
            "pset_name": "Pset_WallCommon",
            "property_name": "LoadBearing",
            "applies_to_types": ["IfcWall"]
        }

        For 'custom':
        {
            "script_id": "uuid-of-validation-script"
        }
        """
    )

    # Scope
    applies_to_ifc_types = models.JSONField(
        default=list,
        help_text="Empty = all types. ['IfcWall', 'IfcDoor'] = only those"
    )
    applies_to_disciplines = models.JSONField(
        default=list,
        help_text="Empty = all disciplines"
    )
    min_mmi_level = models.IntegerField(
        null=True,
        blank=True,
        help_text="Only apply this rule at this MMI level or above"
    )

    # Error message
    error_message_template = models.TextField(
        default="Validation failed",
        help_text="Error message template. Use {placeholders} for dynamic values."
    )

    # Enable/disable
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'validation_rules'
        ordering = ['bep', 'severity', 'rule_code']
        unique_together = [['bep', 'rule_code']]

    def __str__(self):
        return f"{self.rule_code}: {self.name} ({self.severity})"
```

**Example Validation Rules**:

```json
// GUID uniqueness check
{
    "rule_code": "GUID-001",
    "name": "GUID Uniqueness",
    "rule_type": "guid",
    "severity": "error",
    "rule_definition": {
        "check": "uniqueness",
        "allow_duplicates": false
    },
    "error_message_template": "Duplicate GUID found: {guid} appears {count} times"
}

// Geometry check for walls
{
    "rule_code": "GEOM-001",
    "name": "Wall Must Have 3D Geometry",
    "rule_type": "geometry",
    "severity": "error",
    "rule_definition": {
        "check": "has_3d_geometry",
        "min_vertex_count": 8
    },
    "applies_to_ifc_types": ["IfcWall"],
    "min_mmi_level": 300,
    "error_message_template": "Wall {name} (GUID: {guid}) has no 3D geometry at MMI 300+"
}

// Property check
{
    "rule_code": "PROP-001",
    "name": "Load Bearing Property Required",
    "rule_type": "property",
    "severity": "error",
    "rule_definition": {
        "check": "has_property",
        "pset_name": "Pset_WallCommon",
        "property_name": "LoadBearing"
    },
    "applies_to_ifc_types": ["IfcWall"],
    "min_mmi_level": 300,
    "error_message_template": "Wall {name} missing LoadBearing property"
}
```

---

### Table 7: submission_milestones

**Purpose**: Track delivery milestones and requirements

```python
class SubmissionMilestone(models.Model):
    """Project delivery milestone with requirements."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    bep = models.ForeignKey(BEPConfiguration, on_delete=models.CASCADE, related_name='milestones')

    # Milestone identification
    name = models.CharField(
        max_length=100,
        help_text="E.g., 'Preliminary Design', 'Detailed Design', 'For Construction'"
    )
    description = models.TextField(blank=True)

    # Requirements
    target_mmi = models.IntegerField(
        help_text="Expected MMI level for this milestone"
    )
    required_disciplines = models.JSONField(
        default=list,
        help_text="List of disciplines that must deliver: ['ARK', 'RIV', 'ELEKT']"
    )

    # Schedule
    target_date = models.DateField(help_text="When should this be delivered?")
    submission_deadline = models.DateField(
        null=True,
        blank=True,
        help_text="Hard deadline (if different from target)"
    )

    # Review checklist
    review_checklist = models.JSONField(
        default=list,
        help_text="""
        Review checklist items:
        [
            {"item": "Clash detection completed", "required": true},
            {"item": "All GUIDs unique", "required": true},
            {"item": "Property sets complete", "required": true},
            {"item": "Naming conventions followed", "required": false}
        ]
        """
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=[
            ('upcoming', 'Upcoming'),
            ('in_progress', 'In Progress'),
            ('review', 'Under Review'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        default='upcoming'
    )

    # Order
    milestone_order = models.IntegerField(default=0, help_text="Sort order")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'submission_milestones'
        ordering = ['bep', 'milestone_order', 'target_date']

    def __str__(self):
        return f"{self.name} (MMI {self.target_mmi}) - {self.target_date}"
```

**Example Milestones**:

```json
// Milestone 1: Preliminary Design
{
    "name": "Preliminary Design",
    "target_mmi": 100,
    "required_disciplines": ["ARK"],
    "target_date": "2025-02-15",
    "review_checklist": [
        {"item": "Spatial layout defined", "required": true},
        {"item": "Basic element types present", "required": true}
    ]
}

// Milestone 2: Coordination Design
{
    "name": "Coordination Design",
    "target_mmi": 300,
    "required_disciplines": ["ARK", "RIV", "ELEKT", "VVS"],
    "target_date": "2025-04-30",
    "review_checklist": [
        {"item": "Clash detection completed with 0 critical clashes", "required": true},
        {"item": "All elements classified (NS 3451)", "required": true},
        {"item": "Material assignments complete", "required": true},
        {"item": "System memberships assigned", "required": true}
    ]
}

// Milestone 3: Production Ready
{
    "name": "For Construction",
    "target_mmi": 400,
    "required_disciplines": ["ARK", "RIV", "ELEKT", "VVS"],
    "target_date": "2025-06-15",
    "review_checklist": [
        {"item": "All feedback from coordination addressed", "required": true},
        {"item": "Detail level sufficient for construction", "required": true},
        {"item": "Quantities verified", "required": true},
        {"item": "Construction documentation complete", "required": true}
    ]
}
```

---

## API Design

### Endpoint Structure

```
# BEP Management
POST   /api/projects/{project_id}/bep/                    # Create BEP from template or scratch
GET    /api/projects/{project_id}/bep/                    # Get active BEP
GET    /api/projects/{project_id}/bep/versions/           # List all BEP versions
GET    /api/bep/{bep_id}/                                 # Get BEP details
PATCH  /api/bep/{bep_id}/                                 # Update BEP
POST   /api/bep/{bep_id}/activate/                        # Activate BEP (archive others)
DELETE /api/bep/{bep_id}/                                 # Delete BEP (draft only)

# Technical Requirements
GET    /api/bep/{bep_id}/technical-requirements/         # Get technical requirements
PUT    /api/bep/{bep_id}/technical-requirements/         # Update technical requirements

# MMI Scale
GET    /api/bep/{bep_id}/mmi-scale/                      # Get all MMI definitions
POST   /api/bep/{bep_id}/mmi-scale/                      # Add MMI level
GET    /api/bep/{bep_id}/mmi-scale/{mmi_level}/          # Get specific MMI level
PATCH  /api/bep/{bep_id}/mmi-scale/{mmi_level}/          # Update MMI level
DELETE /api/bep/{bep_id}/mmi-scale/{mmi_level}/          # Delete MMI level

# Naming Conventions
GET    /api/bep/{bep_id}/naming-conventions/             # List conventions
POST   /api/bep/{bep_id}/naming-conventions/             # Add convention
PATCH  /api/bep/{bep_id}/naming-conventions/{id}/        # Update convention
DELETE /api/bep/{bep_id}/naming-conventions/{id}/        # Delete convention

# Required Property Sets
GET    /api/bep/{bep_id}/required-psets/                 # List requirements
POST   /api/bep/{bep_id}/required-psets/                 # Add requirement
GET    /api/bep/{bep_id}/required-psets/{ifc_type}/      # Get requirements for type
PATCH  /api/bep/{bep_id}/required-psets/{id}/            # Update requirement
DELETE /api/bep/{bep_id}/required-psets/{id}/            # Delete requirement

# Validation Rules
GET    /api/bep/{bep_id}/validation-rules/               # List rules
POST   /api/bep/{bep_id}/validation-rules/               # Add rule
PATCH  /api/bep/{bep_id}/validation-rules/{id}/          # Update rule
DELETE /api/bep/{bep_id}/validation-rules/{id}/          # Delete rule

# Milestones
GET    /api/bep/{bep_id}/milestones/                     # List milestones
POST   /api/bep/{bep_id}/milestones/                     # Add milestone
PATCH  /api/bep/{bep_id}/milestones/{id}/                # Update milestone
DELETE /api/bep/{bep_id}/milestones/{id}/                # Delete milestone

# Templates
GET    /api/bep-templates/                               # List templates (POFIN, etc.)
GET    /api/bep-templates/{template_id}/                 # Get template details
POST   /api/bep-templates/{template_id}/instantiate/     # Create BEP from template

# Validation Against BEP
POST   /api/models/{model_id}/validate-against-bep/      # Run all BEP checks
GET    /api/models/{model_id}/compliance-report/         # Get validation results
```

---

## Implementation Plan

### Phase 1: Database Schema (Session 010 - Current)

**Goal**: Database structure complete and migrated

**Tasks**:
1. ✅ Create models in `apps/bep/models.py` (7 new models)
2. ✅ Run `python manage.py makemigrations bep`
3. ✅ Run `python manage.py migrate`
4. ✅ Test in Django admin (register all models)
5. ✅ Create initial POFIN template data

**Deliverables**:
- [x] `apps/bep/models.py` (~500 lines)
- [x] `apps/bep/admin.py` (~150 lines)
- [x] Migration file
- [x] Database tables created

---

### Phase 2: BEP Templates (Session 010)

**Goal**: Pre-built templates for common Norwegian projects

**Tasks**:
1. ✅ Create management command `load_bep_templates.py`
2. ✅ Define POFIN Standard Building template
3. ✅ Define Infrastructure (Vegvesen) template
4. ✅ Define Small Building template
5. ✅ Test template instantiation

**Templates**:

#### Template 1: POFIN Standard Building

```python
# MMI Scale
MMI_SCALE = [
    {
        "mmi_level": 100,
        "name": "Konseptfase",
        "description": "Tidligfase skisse for vurdering av alternativer",
        "geometry_requirements": {
            "detail_level": "symbolic",
            "requires_3d": False
        },
        "information_requirements": {
            "requires_name": False,
            "min_property_count": 0
        }
    },
    {
        "mmi_level": 300,
        "name": "Forprosjekt - Koordinert",
        "description": "Koordinert innenfor fagene, klar for tverrfaglig kontroll",
        "geometry_requirements": {
            "detail_level": "approximate",
            "requires_3d": True,
            "collision_ready": True,
            "min_vertex_count": 20
        },
        "information_requirements": {
            "requires_name": True,
            "requires_classification": True,
            "requires_material": True,
            "min_property_count": 5
        }
    },
    {
        "mmi_level": 350,
        "name": "Forprosjekt - Tverrfaglig koordinert",
        "description": "Koordinert på tvers av fag gjennom iterativ prosess",
        "geometry_requirements": {
            "detail_level": "detailed",
            "requires_3d": True,
            "collision_ready": True,
            "min_vertex_count": 30
        },
        "information_requirements": {
            "requires_name": True,
            "requires_description": True,
            "requires_classification": True,
            "requires_material": True,
            "requires_system_membership": True,
            "min_property_count": 10
        }
    },
    {
        "mmi_level": 400,
        "name": "Detaljprosjekt - Klar for produksjon",
        "description": "Tilbakemeldinger godkjent, klar for produksjon",
        "geometry_requirements": {
            "detail_level": "detailed",
            "requires_3d": True,
            "min_vertex_count": 50
        },
        "information_requirements": {
            "requires_name": True,
            "requires_description": True,
            "requires_classification": True,
            "requires_material": True,
            "requires_system_membership": True,
            "min_property_count": 15
        }
    },
    {
        "mmi_level": 500,
        "name": "Utført modell (As-built)",
        "description": "Oppdatert med virkelig geometri, tilleggsinformasjon for drift",
        "geometry_requirements": {
            "detail_level": "as_built",
            "requires_3d": True,
            "min_vertex_count": 50
        },
        "information_requirements": {
            "requires_name": True,
            "requires_description": True,
            "requires_classification": True,
            "requires_material": True,
            "requires_system_membership": True,
            "min_property_count": 20
        }
    }
]

# Technical Requirements
TECHNICAL_REQUIREMENTS = {
    "ifc_schema": "IFC4",
    "model_view_definition": "Design Transfer View",
    "coordinate_system_name": "EPSG:25833",  # ETRS89 / UTM zone 33N
    "coordinate_system_description": "EUREF89 UTM33 (Norge)",
    "length_unit": "METRE",
    "geometry_tolerance": 0.001
}

# Required Property Sets
REQUIRED_PSETS = [
    {
        "ifc_type": "IfcWall",
        "mmi_level": 300,
        "pset_name": "Pset_WallCommon",
        "required_properties": [
            {"name": "LoadBearing", "type": "IfcBoolean"},
            {"name": "IsExternal", "type": "IfcBoolean"}
        ]
    },
    {
        "ifc_type": "IfcDoor",
        "mmi_level": 300,
        "pset_name": "Pset_DoorCommon",
        "required_properties": [
            {"name": "FireRating", "type": "IfcLabel"},
            {"name": "HandicapAccessible", "type": "IfcBoolean"}
        ]
    },
    # ... more
]

# Validation Rules
VALIDATION_RULES = [
    {
        "rule_code": "GUID-001",
        "name": "GUID Uniqueness",
        "rule_type": "guid",
        "severity": "error",
        "rule_definition": {"check": "uniqueness"}
    },
    {
        "rule_code": "GEOM-001",
        "name": "3D Geometry Required at MMI 300+",
        "rule_type": "geometry",
        "severity": "error",
        "rule_definition": {
            "check": "has_3d_geometry",
            "min_vertex_count": 8
        },
        "min_mmi_level": 300
    }
]
```

**Deliverables**:
- [x] `apps/bep/management/commands/load_bep_templates.py` (~300 lines)
- [x] 3 templates defined (POFIN, Infrastructure, Small)
- [x] Test: `python manage.py load_bep_templates`

---

### Phase 3: API Endpoints (Session 011)

**Goal**: REST API for BEP management

**Tasks**:
1. Create serializers for all 7 models
2. Create ViewSets for CRUD operations
3. Add URL routing
4. Test with Postman/curl
5. Document API endpoints

**Deliverables**:
- [ ] `apps/bep/serializers.py` (~300 lines)
- [ ] `apps/bep/views.py` (~400 lines)
- [ ] `apps/bep/urls.py` (~50 lines)
- [ ] API documentation

---

### Phase 4: Rewrite MMI Analyzer (Session 011)

**Goal**: MMI analyzer uses BEP instead of hardcoded scale

**Current Code** (WRONG):
```python
# Hardcoded 1-7 scale
mmi = calculate_mmi(geometry_score, info_score)  # WRONG!
```

**New Code** (CORRECT):
```python
# Get project BEP
bep = BEPConfiguration.objects.get(project=model.project, status='active')
mmi_definitions = bep.mmi_scale.all().order_by('mmi_level')

# Check which MMI level the element meets
element_mmi = None
for mmi_def in mmi_definitions:
    if meets_requirements(element, mmi_def):
        element_mmi = mmi_def.mmi_level
    else:
        break  # Doesn't meet this level, stop

# meets_requirements checks both geometry and information requirements
def meets_requirements(element, mmi_def):
    geom_reqs = mmi_def.geometry_requirements
    info_reqs = mmi_def.information_requirements

    # Check geometry
    if geom_reqs.get('requires_3d') and not element.has_geometry:
        return False
    if element.vertex_count < geom_reqs.get('min_vertex_count', 0):
        return False

    # Check information
    if info_reqs.get('requires_name') and not element.name:
        return False
    if info_reqs.get('requires_classification') and not element.classification:
        return False

    # Check property count
    props = get_properties(element.id)
    prop_count = sum(len(pset.properties) for pset in props)
    if prop_count < info_reqs.get('min_property_count', 0):
        return False

    return True
```

**Deliverables**:
- [ ] Updated `apps/scripting/builtin/mmi_analyzer.py` (~350 lines)
- [ ] BEP context added to script execution
- [ ] Test with models

---

### Phase 5: Frontend BEP Workbench (Sessions 012-013)

**Goal**: UI for configuring BEP

**Pages**:
1. **BEP Overview** (`/projects/{id}/bep`)
   - Current active BEP summary
   - Version history
   - Quick stats
   - "Edit BEP" button

2. **BEP Editor** (`/projects/{id}/bep/edit`)
   - Multi-step form or tabbed interface
   - Tabs:
     - General (name, description, framework)
     - Technical (IFC schema, coordinates, units)
     - MMI Scale (define levels)
     - Naming (conventions)
     - Properties (required Psets)
     - Validation (rules)
     - Milestones (delivery schedule)

3. **MMI Scale Editor**
   - Visual editor for each MMI level
   - Geometry requirements form
   - Information requirements form
   - Discipline-specific rules
   - Preview examples

4. **Template Selector**
   - Browse templates (POFIN, Infrastructure, Custom)
   - Preview template details
   - "Use Template" button → creates BEP from template

**Deliverables**:
- [ ] `components/bep/BEPOverview.tsx`
- [ ] `components/bep/BEPEditor.tsx`
- [ ] `components/bep/MMIScaleEditor.tsx`
- [ ] `pages/BEPWorkbench.tsx`

---

## Success Metrics

### Technical Metrics
- ✅ 7 database tables created and migrated
- ✅ Django admin works for all models
- ✅ 3 templates load successfully
- ✅ BEP can be created and activated
- ⏳ MMI analyzer uses BEP (not hardcoded)
- ⏳ API endpoints return correct data
- ⏳ Frontend can load and display BEP

### User Experience Metrics
- Project manager can create BEP in < 10 minutes using template
- BIM coordinator can customize MMI scale for project needs
- Validation rules can be added/edited without code changes
- Clear error messages when model doesn't meet BEP requirements

### Business Metrics
- Platform is ISO 19650 compliant
- Platform follows buildingSMART Norway POFIN framework
- Platform is attractive to Norwegian AEC market
- Platform differentiates from competitors (most don't have BEP management)

---

## Risk Analysis

### Technical Risks

**Risk 1: Complex JSON validation logic**
- **Probability**: High
- **Impact**: Medium
- **Mitigation**: Start with simple checks, add complexity later. Use JSON Schema for validation.

**Risk 2: Script performance with BEP lookups**
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**: Cache BEP in script context, don't query database repeatedly.

**Risk 3: Breaking existing MMI analyzer**
- **Probability**: High
- **Impact**: Low
- **Mitigation**: Keep old version as backup, test thoroughly before switching.

### Product Risks

**Risk 4: Users don't understand MMI scale**
- **Probability**: Medium
- **Impact**: High
- **Mitigation**: Provide excellent documentation, tooltips, examples. Link to buildingSMART Norge resources.

**Risk 5: Templates don't fit all projects**
- **Probability**: High
- **Impact**: Low
- **Mitigation**: Make templates fully customizable. Provide "blank" template option.

---

## Open Questions

1. **How do we handle BEP updates mid-project?**
   - Archive old BEP, create new version
   - Re-validate all existing models against new BEP?
   - Show diff between BEP versions?

2. **Should validation rules run automatically or on-demand?**
   - On-demand: User clicks "Validate"
   - Automatic: On model upload
   - Scheduled: Daily/weekly
   - **Decision**: Start with on-demand, add automation later

3. **How granular should discipline-specific rules be?**
   - Per discipline? (ARK, RIV, ELEKT)
   - Per model? (each discipline model in multi-model project)
   - Per element? (this wall is ARK, that beam is RIV)
   - **Decision**: Start with per-discipline, per-element is future enhancement

4. **Do we support multiple BEPs per project?**
   - Different BEPs for different phases?
   - Different BEPs for different disciplines?
   - **Decision**: One active BEP at a time, version when phases change

---

## Resources & References

### ISO 19650
- [ISO 19650-1:2018](https://www.iso.org/standard/68078.html) - Organization and digitization of information (concepts and principles)
- [ISO 19650-2:2018](https://www.iso.org/standard/68080.html) - Delivery phase of assets (operational phase)

### buildingSMART Norway
- [buildingSMART Norge website](https://buildingsmart.no/)
- [POFIN Framework](https://buildingsmart.no/pofin)
- [MMI-veilederen](https://mmi-veilederen.no/)

### openBIM Harmony
- [openBIM Harmony Guidelines](https://openbimforum.eu/openbim-harmony/)
- European openBIM Forum

### Norwegian Standards
- NS 3451 - Classification system for building elements
- NS 3420 - Description of construction works

---

## Session 010 Deliverables Checklist

### Must Have (MVP)
- [ ] `apps/bep/` Django app created
- [ ] 7 database models implemented
- [ ] Database migration run successfully
- [ ] Django admin registered for all models
- [ ] Management command `load_bep_templates` working
- [ ] POFIN Standard template loaded
- [ ] Test: Create project → Create BEP from template → Activate BEP

### Should Have
- [ ] API endpoints for BEP CRUD
- [ ] MMI analyzer rewritten to use BEP
- [ ] Test: Run MMI analysis using BEP-defined scale

### Nice to Have
- [ ] Infrastructure template
- [ ] Small building template
- [ ] BEP export to PDF/Excel
- [ ] Frontend BEP overview page

---

## Next Session Preview (Session 011)

**Focus**: API Endpoints & MMI Analyzer Rewrite

**Goals**:
1. Complete REST API for BEP management
2. Rewrite MMI analyzer to use BEP
3. Test end-to-end: Create BEP → Upload model → Run MMI analysis
4. Create frontend BEP overview page

---

**Planning Document Complete**
**Ready for Implementation**
**Session 010 - 2025-10-13**
