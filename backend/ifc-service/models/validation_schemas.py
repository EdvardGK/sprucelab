"""
Pydantic schemas for validation API request/response models.

Mirrors the Django BEP models for use in FastAPI validation service.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Set
from enum import Enum
from datetime import datetime
from dataclasses import dataclass


# ============================================================================
# Enums
# ============================================================================


class RuleType(str, Enum):
    """Types of validation rules (matches ValidationRule.rule_type in Django)."""
    GUID = "guid"
    GEOMETRY = "geometry"
    PROPERTY = "property"
    NAMING = "naming"
    CLASSIFICATION = "classification"
    RELATIONSHIP = "relationship"
    CLASH = "clash"
    CUSTOM = "custom"


class Severity(str, Enum):
    """Severity levels for validation issues."""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationStatus(str, Enum):
    """Overall validation status."""
    PASS = "pass"
    WARNING = "warning"  # Has warnings but no errors
    FAIL = "fail"  # Has errors


# ============================================================================
# Request Models
# ============================================================================


class ValidationRequest(BaseModel):
    """Request to validate an IFC model against BEP rules."""

    model_id: str = Field(..., description="UUID of the Model in database")
    bep_id: Optional[str] = Field(
        None,
        description="UUID of BEP to use. If None, uses project's active BEP"
    )
    file_url: Optional[str] = Field(
        None,
        description="URL to IFC file in storage. If None, uses model.file_url"
    )
    file_path: Optional[str] = Field(
        None,
        description="Local path to IFC file (for testing)"
    )
    rule_types: Optional[List[RuleType]] = Field(
        None,
        description="Specific rule types to run. If None, runs all active rules"
    )
    mmi_level: Optional[int] = Field(
        None,
        description="Target MMI level. Rules with min_mmi_level > this are skipped"
    )
    callback_url: Optional[str] = Field(
        None,
        description="Django callback URL for async completion"
    )


# ============================================================================
# Loaded Rules (from database)
# ============================================================================


class LoadedValidationRule(BaseModel):
    """ValidationRule loaded from BEP database."""

    id: str
    rule_code: str
    name: str
    description: str
    rule_type: RuleType
    severity: Severity
    rule_definition: Dict[str, Any] = Field(default_factory=dict)
    applies_to_ifc_types: List[str] = Field(default_factory=list)
    applies_to_disciplines: List[str] = Field(default_factory=list)
    min_mmi_level: Optional[int] = None
    error_message_template: str = "Validation failed"
    is_active: bool = True


class PropertyValidation(BaseModel):
    """Property validation definition from RequiredPropertySet.required_properties."""

    name: str
    type: Optional[str] = None  # IfcBoolean, IfcLabel, etc.
    required: bool = True
    pattern: Optional[str] = None  # Regex pattern for value
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    allowed_values: Optional[List[str]] = None


class LoadedRequiredPset(BaseModel):
    """RequiredPropertySet loaded from BEP database."""

    id: str
    ifc_type: str
    mmi_level: int
    pset_name: str
    required_properties: List[PropertyValidation] = Field(default_factory=list)
    optional_properties: List[str] = Field(default_factory=list)
    applies_to_disciplines: List[str] = Field(default_factory=list)
    severity: Severity = Severity.ERROR
    is_required: bool = True


class LoadedNamingConvention(BaseModel):
    """NamingConvention loaded from BEP database."""

    id: str
    category: str  # file_naming, element_naming, layer_naming, classification, discipline_code
    name: str
    description: str = ""
    pattern: str
    pattern_type: str  # 'regex' or 'template'
    examples: List[str] = Field(default_factory=list)
    applies_to_disciplines: List[str] = Field(default_factory=list)
    is_required: bool = True
    error_message: str = "Name does not match convention"


class LoadedTechnicalRequirement(BaseModel):
    """TechnicalRequirement loaded from BEP database."""

    ifc_schema: Optional[str] = None  # IFC2X3, IFC4, IFC4X3
    max_file_size_mb: int = 500


class BEPRules(BaseModel):
    """All rules loaded from a BEP."""

    bep_id: str
    bep_name: str
    project_id: str
    validation_rules: List[LoadedValidationRule] = Field(default_factory=list)
    required_psets: List[LoadedRequiredPset] = Field(default_factory=list)
    naming_conventions: List[LoadedNamingConvention] = Field(default_factory=list)
    technical_requirements: Optional[LoadedTechnicalRequirement] = None


# ============================================================================
# Validation Context
# ============================================================================


@dataclass
class ValidationContext:
    """Context for validation execution."""

    model_id: str
    mmi_level: Optional[int] = None
    discipline: Optional[str] = None
    entity_guids: Optional[Set[str]] = None  # Pre-filter to specific entities
    ifc_schema: Optional[str] = None


# ============================================================================
# Result Models
# ============================================================================


class ValidationIssue(BaseModel):
    """A single validation issue found."""

    rule_code: str = Field(..., description="Code of the rule that found this issue")
    rule_name: str = Field(..., description="Name of the rule")
    rule_type: RuleType
    severity: Severity
    message: str = Field(..., description="Human-readable issue description")

    # Element context (if applicable)
    element_guid: Optional[str] = None
    element_type: Optional[str] = None
    element_name: Optional[str] = None

    # Property context (if applicable)
    pset_name: Optional[str] = None
    property_name: Optional[str] = None

    # Additional details
    details: Dict[str, Any] = Field(default_factory=dict)


class RuleExecutionResult(BaseModel):
    """Result of executing a single validation rule."""

    rule_code: str
    rule_name: str
    rule_type: RuleType
    passed: bool = Field(..., description="True if rule passed (no errors)")

    # Counts
    elements_checked: int = 0
    elements_passed: int = 0
    elements_failed: int = 0

    # Issues found
    issues: List[ValidationIssue] = Field(default_factory=list)

    # Timing
    duration_ms: int = 0

    # Error if rule execution itself failed
    error: Optional[str] = None


class ValidationResult(BaseModel):
    """Complete validation result for a model."""

    model_id: str
    bep_id: Optional[str] = None
    validated_at: datetime = Field(default_factory=datetime.utcnow)

    # Overall status
    overall_status: ValidationStatus = ValidationStatus.PASS

    # Element counts
    total_elements: int = 0
    elements_with_issues: int = 0

    # Rule counts
    total_rules_checked: int = 0
    rules_passed: int = 0
    rules_failed: int = 0

    # Issue counts by severity
    error_count: int = 0
    warning_count: int = 0
    info_count: int = 0

    # Detailed results
    rule_results: List[RuleExecutionResult] = Field(default_factory=list)
    all_issues: List[ValidationIssue] = Field(default_factory=list)

    # Processing info
    duration_seconds: float = 0.0
    ifc_schema: Optional[str] = None

    # Summary
    summary: str = ""

    def compute_status(self) -> None:
        """Compute overall status from issue counts."""
        if self.error_count > 0:
            self.overall_status = ValidationStatus.FAIL
        elif self.warning_count > 0:
            self.overall_status = ValidationStatus.WARNING
        else:
            self.overall_status = ValidationStatus.PASS

    def compute_summary(self) -> None:
        """Generate human-readable summary."""
        parts = []
        if self.error_count > 0:
            parts.append(f"{self.error_count} error{'s' if self.error_count != 1 else ''}")
        if self.warning_count > 0:
            parts.append(f"{self.warning_count} warning{'s' if self.warning_count != 1 else ''}")
        if self.info_count > 0:
            parts.append(f"{self.info_count} info")

        if parts:
            self.summary = f"Validation completed with {', '.join(parts)}."
        else:
            self.summary = "Validation passed with no issues."


# ============================================================================
# Callback Models
# ============================================================================


class ValidationCallbackPayload(BaseModel):
    """Payload sent to Django callback when validation completes."""

    model_id: str
    success: bool
    overall_status: ValidationStatus

    # Counts
    total_elements: int
    elements_with_issues: int
    error_count: int
    warning_count: int
    info_count: int

    # Timing
    duration_seconds: float

    # Summary
    summary: str

    # Full result as JSON (for storing in IFCValidationReport)
    validation_report: Dict[str, Any]
