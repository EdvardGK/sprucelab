"""
Property Executor - Validate IFC property sets and properties.

Checks for:
- Required property sets exist on elements
- Required properties exist within property sets
- Property values match validation rules (patterns, ranges)
"""

from typing import List, Any, Tuple, Optional, Dict
import time
import re
import logging

from ..base_executor import BaseRuleExecutor
from models.validation_schemas import (
    LoadedValidationRule,
    LoadedRequiredPset,
    PropertyValidation,
    RuleExecutionResult,
    ValidationIssue,
    ValidationContext,
    RuleType,
    Severity,
)

logger = logging.getLogger(__name__)


class PropertyExecutor(BaseRuleExecutor):
    """Execute property validation rules."""

    rule_type = RuleType.PROPERTY

    async def execute(
        self,
        ifc_file: Any,
        rules: List[LoadedValidationRule],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute property rules.

        Supported rule_definition.check values:
        - "has_pset": Element has specific property set
        - "has_property": Element has specific property in pset
        - "property_value": Property value matches pattern/range

        Args:
            ifc_file: ifcopenshell file
            rules: Property validation rules
            context: Validation context

        Returns:
            List of results (one per rule)
        """
        rules = self.filter_rules_by_context(rules, context)
        results = []

        for rule in rules:
            start_time = time.time()

            try:
                check_type = rule.rule_definition.get('check', 'has_pset')

                if check_type == 'has_pset':
                    issues, checked, passed, failed = self._check_has_pset(
                        ifc_file, rule, context
                    )
                elif check_type == 'has_property':
                    issues, checked, passed, failed = self._check_has_property(
                        ifc_file, rule, context
                    )
                elif check_type == 'property_value':
                    issues, checked, passed, failed = self._check_property_value(
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
                logger.error(f"Error executing property rule {rule.rule_code}: {e}")
                results.append(self.create_result(
                    rule=rule,
                    issues=[],
                    error=str(e),
                    duration_ms=self.time_execution(start_time),
                ))

        return results

    async def execute_required_psets(
        self,
        ifc_file: Any,
        required_psets: List[LoadedRequiredPset],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute RequiredPropertySet rules.

        This is called separately from execute() since RequiredPropertySet
        rules come from a different table than ValidationRule.

        Args:
            ifc_file: ifcopenshell file
            required_psets: List of required property set definitions
            context: Validation context

        Returns:
            List of results (one per pset rule)
        """
        results = []

        # Group psets by ifc_type for efficiency
        psets_by_type: Dict[str, List[LoadedRequiredPset]] = {}
        for pset in required_psets:
            # Filter by MMI level
            if context.mmi_level is not None and context.mmi_level < pset.mmi_level:
                continue
            # Filter by discipline
            if pset.applies_to_disciplines and context.discipline:
                if context.discipline not in pset.applies_to_disciplines:
                    continue

            ifc_type = pset.ifc_type
            if ifc_type not in psets_by_type:
                psets_by_type[ifc_type] = []
            psets_by_type[ifc_type].append(pset)

        # Process each IFC type
        for ifc_type, pset_rules in psets_by_type.items():
            start_time = time.time()

            try:
                # Get elements of this type
                if ifc_type == '*':
                    elements = list(ifc_file.by_type('IfcProduct'))
                else:
                    elements = list(ifc_file.by_type(ifc_type))

                # Filter by context
                if context.entity_guids:
                    elements = [e for e in elements if e.GlobalId in context.entity_guids]

                checked = len(elements)
                failed = 0
                all_issues = []

                for element in elements:
                    element_issues = self._check_element_psets(element, pset_rules)
                    if element_issues:
                        failed += 1
                        all_issues.extend(element_issues)

                passed = checked - failed

                # Create synthetic rule for result
                for pset_rule in pset_rules:
                    result = RuleExecutionResult(
                        rule_code=f"PSET-{pset_rule.pset_name}",
                        rule_name=f"Required Pset: {pset_rule.pset_name}",
                        rule_type=RuleType.PROPERTY,
                        passed=len([i for i in all_issues if i.pset_name == pset_rule.pset_name and i.severity == Severity.ERROR]) == 0,
                        elements_checked=checked,
                        elements_passed=passed,
                        elements_failed=failed,
                        issues=[i for i in all_issues if i.pset_name == pset_rule.pset_name],
                        duration_ms=self.time_execution(start_time),
                    )
                    results.append(result)

            except Exception as e:
                logger.error(f"Error checking psets for {ifc_type}: {e}")

        return results

    def _check_has_pset(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check that elements have a specific property set.

        rule_definition should have:
        - pset_name: Name of required property set
        - applies_to_types: List of IFC types (optional, uses rule.applies_to_ifc_types)
        """
        issues = []
        pset_name = rule.rule_definition.get('pset_name', '')

        if not pset_name:
            return issues, 0, 0, 0

        elements = self.filter_elements(ifc_file, rule, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            psets = self._get_element_psets(element)
            if pset_name not in psets:
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    pset_name=pset_name,
                    element_type=element.is_a(),
                    element_name=getattr(element, 'Name', 'unnamed'),
                )
                if message == rule.error_message_template:
                    message = f"Missing property set '{pset_name}'"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                    pset_name=pset_name,
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _check_has_property(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check that elements have a specific property.

        rule_definition should have:
        - pset_name: Property set name
        - property_name: Required property name
        """
        issues = []
        pset_name = rule.rule_definition.get('pset_name', '')
        property_name = rule.rule_definition.get('property_name', '')

        if not pset_name or not property_name:
            return issues, 0, 0, 0

        elements = self.filter_elements(ifc_file, rule, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            psets = self._get_element_psets(element)
            pset_props = psets.get(pset_name, {})

            if property_name not in pset_props:
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    pset_name=pset_name,
                    property_name=property_name,
                    element_type=element.is_a(),
                )
                if message == rule.error_message_template:
                    message = f"Missing property '{property_name}' in '{pset_name}'"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                    pset_name=pset_name,
                    property_name=property_name,
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _check_property_value(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check that property values match validation rules.

        rule_definition should have:
        - pset_name: Property set name
        - property_name: Property name
        - validation: Dict with validation rules:
          - pattern: Regex pattern
          - min_value: Minimum numeric value
          - max_value: Maximum numeric value
          - allowed_values: List of allowed values
        """
        issues = []
        pset_name = rule.rule_definition.get('pset_name', '')
        property_name = rule.rule_definition.get('property_name', '')
        validation = rule.rule_definition.get('validation', {})

        if not pset_name or not property_name:
            return issues, 0, 0, 0

        elements = self.filter_elements(ifc_file, rule, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            psets = self._get_element_psets(element)
            pset_props = psets.get(pset_name, {})

            if property_name not in pset_props:
                # Property missing - handled by has_property check
                continue

            value = pset_props[property_name]
            is_valid, error_msg = self._validate_value(value, validation)

            if not is_valid:
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    pset_name=pset_name,
                    property_name=property_name,
                    value=value,
                    error=error_msg,
                )
                if message == rule.error_message_template:
                    message = f"Invalid value for '{property_name}': {error_msg}"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                    pset_name=pset_name,
                    property_name=property_name,
                    details={'value': str(value), 'validation': validation},
                ))

        passed = checked - failed
        return issues, checked, passed, failed

    def _check_element_psets(
        self,
        element: Any,
        pset_rules: List[LoadedRequiredPset],
    ) -> List[ValidationIssue]:
        """
        Check an element against required pset rules.

        Returns list of issues found.
        """
        issues = []
        element_psets = self._get_element_psets(element)

        for pset_rule in pset_rules:
            pset_name = pset_rule.pset_name

            # Check pset exists
            if pset_name not in element_psets:
                issues.append(ValidationIssue(
                    rule_code=f"PSET-{pset_name}",
                    rule_name=f"Required Pset: {pset_name}",
                    rule_type=RuleType.PROPERTY,
                    severity=pset_rule.severity,
                    message=f"Missing required property set '{pset_name}'",
                    element_guid=element.GlobalId,
                    element_type=element.is_a(),
                    element_name=getattr(element, 'Name', None),
                    pset_name=pset_name,
                ))
                continue

            pset_props = element_psets[pset_name]

            # Check required properties
            for prop_validation in pset_rule.required_properties:
                prop_name = prop_validation.name

                if prop_name not in pset_props:
                    if prop_validation.required:
                        issues.append(ValidationIssue(
                            rule_code=f"PSET-{pset_name}",
                            rule_name=f"Required Property: {prop_name}",
                            rule_type=RuleType.PROPERTY,
                            severity=pset_rule.severity,
                            message=f"Missing required property '{prop_name}' in '{pset_name}'",
                            element_guid=element.GlobalId,
                            element_type=element.is_a(),
                            element_name=getattr(element, 'Name', None),
                            pset_name=pset_name,
                            property_name=prop_name,
                        ))
                else:
                    # Validate property value
                    value = pset_props[prop_name]
                    validation_dict = {
                        'pattern': prop_validation.pattern,
                        'min_value': prop_validation.min_value,
                        'max_value': prop_validation.max_value,
                        'allowed_values': prop_validation.allowed_values,
                    }
                    is_valid, error_msg = self._validate_value(value, validation_dict)

                    if not is_valid:
                        issues.append(ValidationIssue(
                            rule_code=f"PSET-{pset_name}",
                            rule_name=f"Property Value: {prop_name}",
                            rule_type=RuleType.PROPERTY,
                            severity=pset_rule.severity,
                            message=f"Invalid value for '{prop_name}': {error_msg}",
                            element_guid=element.GlobalId,
                            element_type=element.is_a(),
                            element_name=getattr(element, 'Name', None),
                            pset_name=pset_name,
                            property_name=prop_name,
                            details={'value': str(value)},
                        ))

        return issues

    def _get_element_psets(self, element: Any) -> Dict[str, Dict[str, Any]]:
        """
        Get all property sets for an element.

        Returns dict of {pset_name: {prop_name: value}}
        """
        psets = {}

        try:
            # Check IsDefinedBy relationships
            if not hasattr(element, 'IsDefinedBy'):
                return psets

            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    prop_def = definition.RelatingPropertyDefinition

                    if prop_def.is_a('IfcPropertySet'):
                        pset_name = prop_def.Name
                        psets[pset_name] = {}

                        for prop in prop_def.HasProperties:
                            if prop.is_a('IfcPropertySingleValue'):
                                psets[pset_name][prop.Name] = self._get_property_value(prop)

        except Exception as e:
            logger.debug(f"Error getting psets: {e}")

        return psets

    def _get_property_value(self, prop: Any) -> Any:
        """Extract value from IFC property."""
        try:
            if prop.NominalValue is None:
                return None
            return prop.NominalValue.wrappedValue
        except Exception:
            return None

    def _validate_value(
        self,
        value: Any,
        validation: Dict[str, Any],
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate a property value against validation rules.

        Returns (is_valid, error_message)
        """
        if value is None:
            return True, None  # None values handled by required check

        # Pattern validation
        pattern = validation.get('pattern')
        if pattern and isinstance(value, str):
            if not re.match(pattern, value):
                return False, f"Value '{value}' does not match pattern '{pattern}'"

        # Range validation
        min_val = validation.get('min_value')
        max_val = validation.get('max_value')

        if min_val is not None or max_val is not None:
            try:
                num_value = float(value)
                if min_val is not None and num_value < min_val:
                    return False, f"Value {num_value} is less than minimum {min_val}"
                if max_val is not None and num_value > max_val:
                    return False, f"Value {num_value} is greater than maximum {max_val}"
            except (ValueError, TypeError):
                pass  # Not a number, skip range validation

        # Allowed values validation
        allowed = validation.get('allowed_values')
        if allowed is not None:
            if value not in allowed:
                return False, f"Value '{value}' not in allowed values: {allowed}"

        return True, None
