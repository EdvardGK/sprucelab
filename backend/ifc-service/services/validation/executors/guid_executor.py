"""
GUID Executor - Validate IFC GlobalId values.

Checks for:
- Uniqueness (no duplicate GUIDs)
- Format validity (22-character base64)
"""

from typing import List, Any, Tuple
import time
import re
import logging

from ..base_executor import BaseRuleExecutor
from models.validation_schemas import (
    LoadedValidationRule,
    RuleExecutionResult,
    ValidationIssue,
    ValidationContext,
    RuleType,
    Severity,
)

logger = logging.getLogger(__name__)

# Valid GUID pattern: 22 characters from IFC base64 alphabet
# IFC uses a modified base64: 0-9, A-Z, a-z, _, $
GUID_PATTERN = re.compile(r'^[0-9A-Za-z_$]{22}$')


class GUIDExecutor(BaseRuleExecutor):
    """Execute GUID validation rules."""

    rule_type = RuleType.GUID

    async def execute(
        self,
        ifc_file: Any,
        rules: List[LoadedValidationRule],
        context: ValidationContext,
    ) -> List[RuleExecutionResult]:
        """
        Execute GUID rules.

        Supported rule_definition.check values:
        - "uniqueness": Check all GUIDs are unique
        - "format": Check GUID format is valid (22-char base64)
        - "all": Run all checks (default)

        Args:
            ifc_file: ifcopenshell file
            rules: GUID validation rules
            context: Validation context

        Returns:
            List of results (one per rule)
        """
        # Filter rules by context
        rules = self.filter_rules_by_context(rules, context)

        if not rules:
            return []

        results = []

        for rule in rules:
            start_time = time.time()

            try:
                check_type = rule.rule_definition.get('check', 'all')

                if check_type == 'uniqueness':
                    issues, checked, passed, failed = self._check_uniqueness(
                        ifc_file, rule, context
                    )
                elif check_type == 'format':
                    issues, checked, passed, failed = self._check_format(
                        ifc_file, rule, context
                    )
                else:  # 'all' or unknown
                    # Run both checks
                    u_issues, u_checked, u_passed, u_failed = self._check_uniqueness(
                        ifc_file, rule, context
                    )
                    f_issues, f_checked, f_passed, f_failed = self._check_format(
                        ifc_file, rule, context
                    )
                    issues = u_issues + f_issues
                    checked = max(u_checked, f_checked)  # Same elements checked
                    passed = min(u_passed, f_passed)
                    failed = u_failed + f_failed

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
                logger.error(f"Error executing GUID rule {rule.rule_code}: {e}")
                results.append(self.create_result(
                    rule=rule,
                    issues=[],
                    error=str(e),
                    duration_ms=self.time_execution(start_time),
                ))

        return results

    def _check_uniqueness(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check for duplicate GUIDs.

        Returns:
            (issues, elements_checked, elements_passed, elements_failed)
        """
        issues = []
        guid_map = {}  # guid -> list of elements

        # Get all entities with GlobalId
        elements = self._get_all_entities_with_guid(ifc_file, context)
        checked = len(elements)

        for element in elements:
            guid = element.GlobalId
            if guid not in guid_map:
                guid_map[guid] = []
            guid_map[guid].append(element)

        # Find duplicates
        failed = 0
        for guid, elems in guid_map.items():
            if len(elems) > 1:
                failed += len(elems)
                # Create issue for each duplicate
                types = [e.is_a() for e in elems]
                names = [getattr(e, 'Name', 'unnamed') for e in elems]

                for elem in elems:
                    message = self.format_error_message(
                        rule.error_message_template,
                        guid=guid,
                        count=len(elems),
                        types=', '.join(types),
                    )
                    if message == rule.error_message_template:
                        message = f"Duplicate GUID '{guid}' found on {len(elems)} elements: {', '.join(types)}"

                    issues.append(self.create_issue(
                        rule=rule,
                        message=message,
                        element=elem,
                        details={
                            'duplicate_count': len(elems),
                            'duplicate_types': types,
                            'duplicate_names': names,
                        },
                    ))

        passed = checked - failed
        logger.debug(f"GUID uniqueness: {checked} checked, {len(guid_map)} unique, {failed} duplicates")

        return issues, checked, passed, failed

    def _check_format(
        self,
        ifc_file: Any,
        rule: LoadedValidationRule,
        context: ValidationContext,
    ) -> Tuple[List[ValidationIssue], int, int, int]:
        """
        Check GUID format validity.

        IFC GUIDs should be 22 characters from base64 alphabet.

        Returns:
            (issues, elements_checked, elements_passed, elements_failed)
        """
        issues = []
        elements = self._get_all_entities_with_guid(ifc_file, context)
        checked = len(elements)
        failed = 0

        for element in elements:
            guid = element.GlobalId
            if not GUID_PATTERN.match(guid):
                failed += 1
                message = self.format_error_message(
                    rule.error_message_template,
                    guid=guid,
                    length=len(guid),
                )
                if message == rule.error_message_template:
                    message = f"Invalid GUID format: '{guid}' (expected 22 characters, got {len(guid)})"

                issues.append(self.create_issue(
                    rule=rule,
                    message=message,
                    element=element,
                    details={
                        'guid': guid,
                        'length': len(guid),
                        'expected_length': 22,
                    },
                ))

        passed = checked - failed
        logger.debug(f"GUID format: {checked} checked, {passed} valid, {failed} invalid")

        return issues, checked, passed, failed

    def _get_all_entities_with_guid(
        self,
        ifc_file: Any,
        context: ValidationContext,
    ) -> List[Any]:
        """
        Get all IFC entities that have a GlobalId.

        This includes IfcRoot and all its subtypes.
        """
        try:
            # IfcRoot is the base class for all entities with GlobalId
            entities = ifc_file.by_type('IfcRoot')

            # Filter by context if specified
            if context.entity_guids:
                entities = [e for e in entities if e.GlobalId in context.entity_guids]

            return entities

        except Exception as e:
            logger.warning(f"Error getting entities: {e}")
            return []
