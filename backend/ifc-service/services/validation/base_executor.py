"""
Base executor interface for validation rules.

All rule-type-specific executors inherit from this.
"""

from abc import ABC, abstractmethod
from typing import List, Any, Optional, Set
import time
import logging

from models.validation_schemas import (
    LoadedValidationRule,
    RuleExecutionResult,
    ValidationIssue,
    ValidationContext,
    RuleType,
    Severity,
)

logger = logging.getLogger(__name__)


class BaseRuleExecutor(ABC):
    """
    Abstract base class for rule executors.

    Each executor handles one RuleType (guid, property, naming, etc.)
    and knows how to execute rules of that type against IFC data.
    """

    # Set by subclass
    rule_type: RuleType

    @abstractmethod
    async def execute(
        self,
        ifc_file: Any,  # ifcopenshell.file
        rules: List[LoadedValidationRule],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute rules against IFC file.

        Args:
            ifc_file: Open ifcopenshell file object
            rules: Rules of this executor's type
            context: Additional context (mmi_level, discipline, etc.)

        Returns:
            List of execution results (one per rule)
        """
        pass

    def filter_rules_by_context(
        self,
        rules: List[LoadedValidationRule],
        context: ValidationContext,
    ) -> List[LoadedValidationRule]:
        """
        Filter rules based on context (MMI level, discipline).

        Args:
            rules: All rules of this type
            context: Validation context

        Returns:
            Rules that apply to the given context
        """
        filtered = []

        for rule in rules:
            # Check MMI level
            if rule.min_mmi_level is not None and context.mmi_level is not None:
                if context.mmi_level < rule.min_mmi_level:
                    continue

            # Check discipline
            if rule.applies_to_disciplines and context.discipline:
                if context.discipline not in rule.applies_to_disciplines:
                    continue

            filtered.append(rule)

        return filtered

    def filter_elements(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> List[Any]:
        """
        Get IFC elements that this rule applies to.

        Args:
            ifc_file: ifcopenshell file
            rule: The rule to check
            context: Validation context (may have pre-filtered guids)

        Returns:
            List of IFC elements to check
        """
        # Get all products (building elements)
        try:
            all_elements = ifc_file.by_type('IfcProduct')
        except Exception:
            return []

        # Filter by IFC types if specified
        if rule.applies_to_ifc_types:
            type_set = set(rule.applies_to_ifc_types)
            all_elements = [e for e in all_elements if e.is_a() in type_set]

        # Filter by pre-selected GUIDs if specified in context
        if context.entity_guids:
            all_elements = [
                e for e in all_elements
                if e.GlobalId in context.entity_guids
            ]

        return all_elements

    def format_error_message(
        self,
        template: str,
        **kwargs,
    ) -> str:
        """
        Format error message from template with placeholders.

        Args:
            template: Message template with {placeholders}
            **kwargs: Values to substitute

        Returns:
            Formatted message
        """
        try:
            return template.format(**kwargs)
        except KeyError:
            # If placeholder is missing, return template as-is
            return template

    def create_issue(
        self,
        rule: LoadedValidationRule,
        message: str,
        element: Any = None,
        pset_name: Optional[str] = None,
        property_name: Optional[str] = None,
        details: Optional[dict] = None,
    ) -> ValidationIssue:
        """
        Create a ValidationIssue from rule and context.

        Args:
            rule: The rule that found this issue
            message: Issue description
            element: IFC element (optional)
            pset_name: Property set name (optional)
            property_name: Property name (optional)
            details: Additional details (optional)

        Returns:
            ValidationIssue
        """
        issue = ValidationIssue(
            rule_code=rule.rule_code,
            rule_name=rule.name,
            rule_type=rule.rule_type,
            severity=rule.severity,
            message=message,
            pset_name=pset_name,
            property_name=property_name,
            details=details or {},
        )

        # Add element info if available
        if element is not None:
            try:
                issue.element_guid = getattr(element, 'GlobalId', None)
                issue.element_type = element.is_a() if hasattr(element, 'is_a') else None
                issue.element_name = getattr(element, 'Name', None)
            except Exception:
                pass

        return issue

    def create_result(
        self,
        rule: LoadedValidationRule,
        issues: List[ValidationIssue],
        elements_checked: int = 0,
        elements_passed: int = 0,
        elements_failed: int = 0,
        duration_ms: int = 0,
        error: Optional[str] = None,
    ) -> RuleExecutionResult:
        """
        Create a RuleExecutionResult.

        Args:
            rule: The executed rule
            issues: Issues found
            elements_checked: Total elements checked
            elements_passed: Elements that passed
            elements_failed: Elements that failed
            duration_ms: Execution time
            error: Error message if execution failed

        Returns:
            RuleExecutionResult
        """
        # Count issues by severity
        error_issues = [i for i in issues if i.severity == Severity.ERROR]

        return RuleExecutionResult(
            rule_code=rule.rule_code,
            rule_name=rule.name,
            rule_type=rule.rule_type,
            passed=len(error_issues) == 0 and error is None,
            elements_checked=elements_checked,
            elements_passed=elements_passed,
            elements_failed=elements_failed,
            issues=issues,
            duration_ms=duration_ms,
            error=error,
        )

    def time_execution(self, start_time: float) -> int:
        """
        Calculate execution time in milliseconds.

        Args:
            start_time: time.time() value at start

        Returns:
            Duration in milliseconds
        """
        return int((time.time() - start_time) * 1000)
