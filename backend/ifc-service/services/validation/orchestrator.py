"""
Validation Orchestrator - Coordinates validation execution.

Main entry point for validating IFC models against BEP rules.
"""

from typing import Optional, List, Dict, Any
import time
import logging
import tempfile
import os
import httpx

from config import settings
from core.database import fetch_one
from models.validation_schemas import (
    ValidationRequest,
    ValidationResult,
    ValidationContext,
    ValidationCallbackPayload,
    RuleType,
    Severity,
    BEPRules,
)
from .bep_loader import bep_loader
from .executors import GUIDExecutor, PropertyExecutor, NamingExecutor

logger = logging.getLogger(__name__)


# SQL to get model info
GET_MODEL_INFO = """
SELECT id::text, project_id::text, file_url, ifc_schema
FROM models
WHERE id = $1
"""


class ValidationOrchestrator:
    """
    Orchestrates IFC validation against BEP rules.

    Flow:
    1. Load BEP rules from database
    2. Load IFC file
    3. Execute each rule type
    4. Aggregate results
    5. Callback to Django (optional)
    """

    def __init__(self):
        self.executors = {
            RuleType.GUID: GUIDExecutor(),
            RuleType.PROPERTY: PropertyExecutor(),
            RuleType.NAMING: NamingExecutor(),
        }

    async def validate_model(
        self,
        request: ValidationRequest,
    ) -> ValidationResult:
        """
        Main entry point for validation.

        Args:
            request: Validation request with model_id, optional bep_id, etc.

        Returns:
            ValidationResult with all issues
        """
        start_time = time.time()

        try:
            logger.info(f"Starting validation for model: {request.model_id}")

            # Get model info
            model_info = await fetch_one(GET_MODEL_INFO, request.model_id)
            if not model_info:
                return self._error_result(
                    request.model_id,
                    f"Model not found: {request.model_id}",
                    start_time
                )

            # Determine file source
            file_path = request.file_path
            file_url = request.file_url or model_info['file_url']
            temp_file = None

            if not file_path and file_url:
                # Download file to temp location
                temp_file = await self._download_file(file_url)
                if not temp_file:
                    return self._error_result(
                        request.model_id,
                        f"Failed to download file from: {file_url}",
                        start_time
                    )
                file_path = temp_file

            if not file_path:
                return self._error_result(
                    request.model_id,
                    "No file path or URL provided",
                    start_time
                )

            try:
                # Load BEP rules
                bep_rules = await bep_loader.load_rules_for_model(
                    request.model_id,
                    request.bep_id,
                )

                if not bep_rules:
                    logger.info(f"No BEP found for model {request.model_id}, running basic validation")
                    bep_rules = self._create_default_rules()

                # Load IFC file
                ifc_file = self._load_ifc(file_path)
                if not ifc_file:
                    return self._error_result(
                        request.model_id,
                        f"Failed to load IFC file: {file_path}",
                        start_time
                    )

                # Create validation context
                context = ValidationContext(
                    model_id=request.model_id,
                    mmi_level=request.mmi_level,
                    ifc_schema=model_info['ifc_schema'],
                )

                # Execute validation
                result = await self._execute_validation(
                    ifc_file=ifc_file,
                    bep_rules=bep_rules,
                    context=context,
                    rule_types=request.rule_types,
                )

                # Set model/BEP info
                result.model_id = request.model_id
                result.bep_id = bep_rules.bep_id if bep_rules else None
                result.ifc_schema = model_info['ifc_schema']
                result.duration_seconds = time.time() - start_time

                # Compute summary
                result.compute_status()
                result.compute_summary()

                logger.info(
                    f"Validation complete: {result.overall_status.value}, "
                    f"{result.error_count} errors, {result.warning_count} warnings"
                )

                # Callback to Django if URL provided
                if request.callback_url:
                    await self._send_callback(request.callback_url, result)

                return result

            finally:
                # Cleanup temp file
                if temp_file and os.path.exists(temp_file):
                    try:
                        os.unlink(temp_file)
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"Validation failed: {e}", exc_info=True)
            return self._error_result(
                request.model_id,
                str(e),
                start_time
            )

    async def _execute_validation(
        self,
        ifc_file: Any,
        bep_rules: BEPRules,
        context: ValidationContext,
        rule_types: Optional[List[RuleType]] = None,
    ) -> ValidationResult:
        """
        Execute all validation rules.

        Args:
            ifc_file: Loaded ifcopenshell file
            bep_rules: Rules to execute
            context: Validation context
            rule_types: Optional filter for rule types

        Returns:
            ValidationResult
        """
        result = ValidationResult(model_id=context.model_id)
        all_issues = []

        # Count total elements for reporting
        try:
            result.total_elements = len(list(ifc_file.by_type('IfcProduct')))
        except Exception:
            result.total_elements = 0

        # Group validation rules by type
        rules_by_type: Dict[RuleType, List] = {}
        for rule in bep_rules.validation_rules:
            if rule_types and rule.rule_type not in rule_types:
                continue
            if rule.rule_type not in rules_by_type:
                rules_by_type[rule.rule_type] = []
            rules_by_type[rule.rule_type].append(rule)

        # Execute ValidationRule rules
        for rule_type, rules in rules_by_type.items():
            if rule_type in self.executors:
                executor = self.executors[rule_type]
                rule_results = await executor.execute(ifc_file, rules, context)

                for rr in rule_results:
                    result.rule_results.append(rr)
                    result.total_rules_checked += 1
                    if rr.passed:
                        result.rules_passed += 1
                    else:
                        result.rules_failed += 1
                    all_issues.extend(rr.issues)

        # Execute RequiredPropertySet rules (if property type included)
        if not rule_types or RuleType.PROPERTY in rule_types:
            if bep_rules.required_psets:
                prop_executor = self.executors[RuleType.PROPERTY]
                pset_results = await prop_executor.execute_required_psets(
                    ifc_file, bep_rules.required_psets, context
                )

                for rr in pset_results:
                    result.rule_results.append(rr)
                    result.total_rules_checked += 1
                    if rr.passed:
                        result.rules_passed += 1
                    else:
                        result.rules_failed += 1
                    all_issues.extend(rr.issues)

        # Execute NamingConvention rules (if naming type included)
        if not rule_types or RuleType.NAMING in rule_types:
            if bep_rules.naming_conventions:
                naming_executor = self.executors[RuleType.NAMING]
                naming_results = await naming_executor.execute_naming_conventions(
                    ifc_file, bep_rules.naming_conventions, context
                )

                for rr in naming_results:
                    result.rule_results.append(rr)
                    result.total_rules_checked += 1
                    if rr.passed:
                        result.rules_passed += 1
                    else:
                        result.rules_failed += 1
                    all_issues.extend(rr.issues)

        # Count issues by severity
        result.all_issues = all_issues
        elements_with_issues = set()

        for issue in all_issues:
            if issue.severity == Severity.ERROR:
                result.error_count += 1
            elif issue.severity == Severity.WARNING:
                result.warning_count += 1
            else:
                result.info_count += 1

            if issue.element_guid:
                elements_with_issues.add(issue.element_guid)

        result.elements_with_issues = len(elements_with_issues)

        return result

    def _load_ifc(self, file_path: str) -> Optional[Any]:
        """Load IFC file with ifcopenshell."""
        try:
            import ifcopenshell
            return ifcopenshell.open(file_path)
        except Exception as e:
            logger.error(f"Failed to load IFC: {e}")
            return None

    async def _download_file(self, url: str) -> Optional[str]:
        """Download file from URL to temp location."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=60.0)
                response.raise_for_status()

                # Create temp file
                suffix = '.ifc'
                fd, path = tempfile.mkstemp(suffix=suffix)
                with os.fdopen(fd, 'wb') as f:
                    f.write(response.content)

                return path

        except Exception as e:
            logger.error(f"Failed to download file: {e}")
            return None

    async def _send_callback(
        self,
        callback_url: str,
        result: ValidationResult,
    ) -> None:
        """Send validation result to Django callback."""
        try:
            payload = ValidationCallbackPayload(
                model_id=result.model_id,
                success=result.error_count == 0,
                overall_status=result.overall_status,
                total_elements=result.total_elements,
                elements_with_issues=result.elements_with_issues,
                error_count=result.error_count,
                warning_count=result.warning_count,
                info_count=result.info_count,
                duration_seconds=result.duration_seconds,
                summary=result.summary,
                validation_report=result.model_dump(),
            )

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    callback_url,
                    json=payload.model_dump(),
                    timeout=30.0,
                )
                response.raise_for_status()
                logger.info(f"Callback sent to {callback_url}")

        except Exception as e:
            logger.error(f"Failed to send callback: {e}")

    def _create_default_rules(self) -> BEPRules:
        """Create default validation rules when no BEP exists."""
        from models.validation_schemas import LoadedValidationRule

        return BEPRules(
            bep_id="default",
            bep_name="Default Validation",
            project_id="",
            validation_rules=[
                LoadedValidationRule(
                    id="default-guid",
                    rule_code="GUID-001",
                    name="GUID Uniqueness",
                    description="Check that all GUIDs are unique",
                    rule_type=RuleType.GUID,
                    severity=Severity.ERROR,
                    rule_definition={"check": "uniqueness"},
                    error_message_template="Duplicate GUID found",
                ),
                LoadedValidationRule(
                    id="default-guid-format",
                    rule_code="GUID-002",
                    name="GUID Format",
                    description="Check that GUIDs have valid format",
                    rule_type=RuleType.GUID,
                    severity=Severity.WARNING,
                    rule_definition={"check": "format"},
                    error_message_template="Invalid GUID format",
                ),
            ],
            required_psets=[],
            naming_conventions=[],
            technical_requirements=None,
        )

    def _error_result(
        self,
        model_id: str,
        error: str,
        start_time: float,
    ) -> ValidationResult:
        """Create an error result."""
        from models.validation_schemas import ValidationIssue

        result = ValidationResult(model_id=model_id)
        result.overall_status = Severity.ERROR
        result.error_count = 1
        result.duration_seconds = time.time() - start_time
        result.summary = f"Validation failed: {error}"
        result.all_issues = [
            ValidationIssue(
                rule_code="SYSTEM",
                rule_name="System Error",
                rule_type=RuleType.GUID,  # Arbitrary, doesn't matter for system errors
                severity=Severity.ERROR,
                message=error,
            )
        ]
        return result


# Singleton instance
validation_orchestrator = ValidationOrchestrator()
