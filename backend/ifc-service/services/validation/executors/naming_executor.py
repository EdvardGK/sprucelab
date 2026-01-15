"""
Naming Executor - Validate element and file naming conventions.

Checks for:
- Element names match patterns
- File names match project conventions
"""

from typing import List, Any, Tuple
import time
import re
import logging

from ..base_executor import BaseRuleExecutor
from models.validation_schemas import (
    LoadedValidationRule,
    LoadedNamingConvention,
    RuleExecutionResult,
    ValidationIssue,
    ValidationContext,
    RuleType,
    Severity,
)

logger = logging.getLogger(__name__)


class NamingExecutor(BaseRuleExecutor):
    """Execute naming convention validation rules."""

    rule_type = RuleType.NAMING

    async def execute(
        self,
        ifc_file: Any,
        rules: List[LoadedValidationRule],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute naming rules from ValidationRule table.

        Supported rule_definition.check values:
        - "element_naming": Check element names
        - "has_name": Check elements have names

        Args:
            ifc_file: ifcopenshell file
            rules: Naming validation rules
            context: Validation context

        Returns:
            List of results (one per rule)
        """
        rules = self.filter_rules_by_context(rules, context)
        results = []

        for rule in rules:
            start_time = time.time()

            try:
                check_type = rule.rule_definition.get('check', 'element_naming')

                if check_type == 'element_naming':
                    issues, checked, passed, failed = self._check_element_naming(
                        ifc_file, rule, context
                    )
                elif check_type == 'has_name':
                    issues, checked, passed, failed = self._check_has_name(
                        ifc_file, rule, context
                    )
                else:
                    logger.warning(f"Unknown check type: {check_type}")
                    issues, checked, passed, failed = [], 0, 0, 0

                result = self.create_result(
                    rule=rule,
                    issues=issues,
                    elements_checked=checked,
                    elements_passed=passed,
                    elements_failed=failed,
                    duration_ms=self.time_execution(start_time),
                )
                results.append(result)

            except Exception as e:
                logger.error(f"Error executing naming rule {rule.rule_code}: {e}")
                results.append(self.create_result(
                    rule=rule,
                    issues=[],
                    error=str(e),
                    duration_ms=self.time_execution(start_time),
                ))

        return results

    async def execute_naming_conventions(
        self,
        ifc_file: Any,
        conventions: List[LoadedNamingConvention],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute NamingConvention rules from dedicated table.

        This is called separately from execute() since NamingConvention
        rules come from a different table than ValidationRule.

        Args:
            ifc_file: ifcopenshell file
            conventions: List of naming convention definitions
            context: Validation context

        Returns:
            List of results (one per convention)
        """
        results = []

        # Filter conventions by discipline
        filtered = []
        for conv in conventions:
            if conv.applies_to_disciplines and context.discipline:
                if context.discipline not in conv.applies_to_disciplines:
                    continue
            filtered.append(conv)

        # Group by category
        for conv in filtered:
            start_time = time.time()

            try:
                if conv.category == 'element_naming':
                    issues, checked, passed, failed = self._check_convention_elements(
                        ifc_file, conv, context
                    )
                elif conv.category == 'file_naming':
                    # File naming is checked against model name, not IFC elements
                    # This would need model metadata passed in context
                    issues, checked, passed, failed = [], 0, 0, 0
                else:
                    # Other categories (layer_naming, classification, discipline_code)
                    # can be added later
                    issues, checked, passed, failed = [], 0, 0, 0

                result = RuleExecutionResult(
                    rule_code=f"NAME-{conv.category.upper()}",
                    rule_name=conv.name,
                    rule_type=RuleType.NAMING,
                    passed=len([i for i in issues if i.severity == Severity.ERROR]) == 0,
                    elements_checked=checked,
                    elements_passed=passed,
                    elements_failed=failed,
                    issues=issues,
                    duration_ms=self.time_execution(start_time),
                )
                results.append(result)

            except Exception as e:
                logger.error(f"Error checking convention {conv.name}: {e}")

        return results

    def _check_element_naming(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check that element names match a pattern.

        rule_definition should have:
        - pattern: Regex pattern
        - pattern_type: 'regex' or 'template'
        """
        issues = []
        pattern = rule.rule_definition.get('pattern', '')
        pattern_type = rule.rule_definition.get('pattern_type', 'regex')

        if not pattern:
            return issues, 0, 0, 0

        elements = self.filter_elements(ifc_file, rule, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            name = getattr(element, 'Name', None)

            if name is None:
                # No name - handled by has_name check
                continue

            is_valid = self._validate_name(name, pattern, pattern_type)

            if not is_valid:
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    name=name,
                    pattern=pattern,
                    element_type=element.is_a(),
                )
                if message == rule.error_message_template:
                    message = f"Name '{name}' does not match pattern '{pattern}'"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                    details={'name': name, 'pattern': pattern},
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _check_has_name(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check that elements have names.

        rule_definition can have:
        - allow_empty: Whether empty string is allowed (default: False)
        """
        issues = []
        allow_empty = rule.rule_definition.get('allow_empty', False)

        elements = self.filter_elements(ifc_file, rule, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            name = getattr(element, 'Name', None)

            has_name = name is not None
            if has_name and not allow_empty:
                has_name = len(str(name).strip()) > 0

            if not has_name:
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    element_type=element.is_a(),
                    guid=element.GlobalId,
                )
                if message == rule.error_message_template:
                    message = f"Element has no name"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _check_convention_elements(
        self,
        ifc_file: Any,
        convention: LoadedNamingConvention,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check all elements against a naming convention.

        Returns (issues, checked, passed, failed)
        """
        issues = []

        # Get all products
        try:
            elements = list(ifc_file.by_type('IfcProduct'))
        except Exception:
            return issues, 0, 0, 0

        # Filter by context
        if context.entity_guids:
            elements = [e for e in elements if e.GlobalId in context.entity_guids]

        checked = len(elements)
        failed = 0
        severity = Severity.ERROR if convention.is_required else Severity.WARNING

        for element in elements:
            name = getattr(element, 'Name', None)

            if name is None:
                # Skip elements without names for pattern check
                continue

            is_valid = self._validate_name(name, convention.pattern, convention.pattern_type)

            if not is_valid:
                failed += 1
                issues.append(ValidationIssue(
                    rule_code=f"NAME-{convention.category.upper()}",
                    rule_name=convention.name,
                    rule_type=RuleType.NAMING,
                    severity=severity,
                    message=convention.error_message.format(name=name) if '{name}' in convention.error_message else f"{convention.error_message}: '{name}'",
                    element_guid=element.GlobalId,
                    element_type=element.is_a(),
                    element_name=name,
                    details={
                        'name': name,
                        'pattern': convention.pattern,
                        'examples': convention.examples,
                    },
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _validate_name(
        self,
        name: str,
        pattern: str,
        pattern_type: str,
    ) -> bool:
        """
        Validate name against pattern.

        Args:
            name: Name to validate
            pattern: Pattern to match
            pattern_type: 'regex' or 'template'

        Returns:
            True if name matches pattern
        """
        if pattern_type == 'regex':
            try:
                return bool(re.match(pattern, name))
            except re.error:
                logger.warning(f"Invalid regex pattern: {pattern}")
                return True  # Don't fail on invalid pattern

        elif pattern_type == 'template':
            # Template validation (e.g., "{project}_{discipline}_{type}_{number}")
            # Convert template to regex
            try:
                # Replace placeholders with regex groups
                regex_pattern = pattern
                regex_pattern = re.sub(r'\{[^}]+\}', r'[^_]+', regex_pattern)
                regex_pattern = f'^{regex_pattern}$'
                return bool(re.match(regex_pattern, name))
            except re.error:
                logger.warning(f"Error converting template to regex: {pattern}")
                return True

        return True
