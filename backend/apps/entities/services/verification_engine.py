"""
Verification Engine v1 - Type-level verification against ProjectConfig rules.

Checks TypeMapping DB records (not IFC files) for classification completeness
and correctness. Runs default rules + optional custom rules from ProjectConfig.

Usage:
    engine = VerificationEngine()
    result = engine.verify_model(model_id, project_id=project_id)
"""

import re
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from django.db.models import Prefetch

logger = logging.getLogger(__name__)


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class VerificationIssue:
    rule_id: str
    rule_name: str
    severity: str  # 'error' | 'warning' | 'info'
    message: str


@dataclass
class TypeVerificationResult:
    type_id: str
    type_name: str
    status: str  # 'pass' | 'warning' | 'fail'
    issues: list[VerificationIssue] = field(default_factory=list)


@dataclass
class ModelVerificationResult:
    model_id: str
    total_types: int
    checked: int
    passed: int
    warnings: int
    failed: int
    skipped: int
    health_score: float  # 0-100
    type_results: list[TypeVerificationResult] = field(default_factory=list)
    rules_applied: list[str] = field(default_factory=list)
    timestamp: str = ''

    def to_dict(self) -> dict:
        return asdict(self)


# =============================================================================
# Default Rules
# =============================================================================

DEFAULT_RULES = [
    {
        'id': 'has_ns3451',
        'name': 'NS3451 classification required',
        'severity': 'error',
        'check': 'has_field',
        'target': 'mapping',
        'field': 'ns3451_code',
    },
    {
        'id': 'has_unit',
        'name': 'Representative unit required',
        'severity': 'warning',
        'check': 'has_field',
        'target': 'mapping',
        'field': 'representative_unit',
    },
    {
        'id': 'has_material_layers',
        'name': 'Material layers defined',
        'severity': 'warning',
        'check': 'has_related',
        'target': 'mapping',
        'related': 'definition_layers',
        'min_count': 1,
    },
    {
        'id': 'type_name_not_empty',
        'name': 'Type name must not be empty',
        'severity': 'error',
        'check': 'has_field',
        'target': 'type',
        'field': 'type_name',
    },
]


# =============================================================================
# Verification Engine
# =============================================================================

class VerificationEngine:
    """
    Type-level verification engine.

    Checks TypeMapping records against rules from ProjectConfig + defaults.
    Updates verification_status and verification_issues on each TypeMapping.
    """

    def verify_model(
        self,
        model_id: str,
        project_id: str | None = None,
    ) -> ModelVerificationResult:
        """
        Run verification on all types for a model.

        Args:
            model_id: UUID of the Model
            project_id: UUID of Project (auto-detected from model if not provided)

        Returns:
            ModelVerificationResult with per-type issues and summary
        """
        from apps.entities.models import IFCType, TypeMapping, TypeDefinitionLayer
        from apps.models.models import Model

        # Get model and auto-detect project
        model = Model.objects.select_related('project').get(id=model_id)
        if not project_id:
            project_id = str(model.project_id)

        # Load rules
        rules = self._load_rules(project_id)
        rule_ids = [r['id'] for r in rules]

        # Fetch all types with prefetched mappings and layers
        types = (
            IFCType.objects
            .filter(model_id=model_id)
            .select_related('mapping', 'mapping__ns3451')
            .prefetch_related(
                Prefetch(
                    'mapping__definition_layers',
                    queryset=TypeDefinitionLayer.objects.order_by('layer_order')
                )
            )
            .order_by('ifc_type', 'type_name')
        )

        # Run verification
        now = datetime.now(timezone.utc)
        type_results = []
        passed = 0
        warnings = 0
        failed = 0
        skipped = 0
        checked = 0

        # Collect TypeMapping bulk updates
        mappings_to_update = []

        for ifc_type in types:
            # Skip non-primary types
            if ifc_type.ownership_status in ('ghost', 'reference'):
                skipped += 1
                continue

            # Skip ignored types
            mapping = getattr(ifc_type, 'mapping', None)
            if mapping and mapping.mapping_status == 'ignored':
                skipped += 1
                continue

            checked += 1

            # Get layers (empty list if no mapping)
            layers = list(mapping.definition_layers.all()) if mapping else []

            # Check all rules
            result = self._check_type(ifc_type, mapping, layers, rules)
            type_results.append(result)

            # Count by status
            if result.status == 'pass':
                passed += 1
            elif result.status == 'warning':
                warnings += 1
            else:
                failed += 1

            # Prepare mapping update
            if mapping:
                # Determine verification_status from issues
                has_errors = any(i.severity == 'error' for i in result.issues)
                has_warnings = any(i.severity == 'warning' for i in result.issues)

                if has_errors:
                    mapping.verification_status = 'flagged'
                elif has_warnings:
                    mapping.verification_status = 'auto'
                else:
                    mapping.verification_status = 'auto'  # Engine-verified (not human-verified)

                mapping.verification_issues = [asdict(i) for i in result.issues]
                mapping.verified_engine_at = now
                mappings_to_update.append(mapping)

        # Bulk update mappings
        if mappings_to_update:
            TypeMapping.objects.bulk_update(
                mappings_to_update,
                ['verification_status', 'verification_issues', 'verified_engine_at'],
                batch_size=200,
            )

        # Calculate health score
        health_score = (passed / checked * 100) if checked > 0 else 0.0

        total_types = types.count()

        result = ModelVerificationResult(
            model_id=str(model_id),
            total_types=total_types,
            checked=checked,
            passed=passed,
            warnings=warnings,
            failed=failed,
            skipped=skipped,
            health_score=round(health_score, 1),
            type_results=type_results,
            rules_applied=rule_ids,
            timestamp=now.isoformat(),
        )

        logger.info(
            'Verification complete for model %s: %d/%d passed (%.1f%%)',
            model_id, passed, checked, health_score,
        )

        return result

    def _load_rules(self, project_id: str | None) -> list[dict]:
        """
        Load verification rules from ProjectConfig + defaults.

        Custom rules from ProjectConfig.config['verification']['rules'] are
        merged with DEFAULT_RULES. Custom rules with the same ID override defaults.
        """
        rules = list(DEFAULT_RULES)

        if project_id:
            try:
                from apps.projects.models import ProjectConfig
                config = ProjectConfig.objects.filter(
                    project_id=project_id,
                    is_active=True,
                ).first()

                if config and config.config:
                    custom_rules = (
                        config.config
                        .get('verification', {})
                        .get('rules', [])
                    )
                    if custom_rules:
                        # Custom rules override defaults with same ID
                        default_ids = {r['id'] for r in rules}
                        for cr in custom_rules:
                            if cr.get('id') in default_ids:
                                rules = [r for r in rules if r['id'] != cr['id']]
                            rules.append(cr)

                        logger.info(
                            'Loaded %d custom rules from ProjectConfig for project %s',
                            len(custom_rules), project_id,
                        )
            except Exception as e:
                logger.warning('Failed to load ProjectConfig rules: %s', e)

        return rules

    def _check_type(
        self,
        ifc_type,
        mapping,
        layers: list,
        rules: list[dict],
    ) -> TypeVerificationResult:
        """Run all rules against one type, collect issues."""
        issues = []

        for rule in rules:
            issue = self._check_rule(rule, ifc_type, mapping, layers)
            if issue:
                issues.append(issue)

        # Determine status
        if any(i.severity == 'error' for i in issues):
            status = 'fail'
        elif any(i.severity == 'warning' for i in issues):
            status = 'warning'
        else:
            status = 'pass'

        return TypeVerificationResult(
            type_id=str(ifc_type.id),
            type_name=ifc_type.type_name or '',
            status=status,
            issues=issues,
        )

    def _check_rule(
        self,
        rule: dict,
        ifc_type,
        mapping,
        layers: list,
    ) -> VerificationIssue | None:
        """
        Check a single rule against a type.

        Rule checks:
        - has_field: target.field is truthy
        - has_related: len(related) >= min_count
        - regex: re.match(pattern, target.field)
        - value_in: target.field in allowed_values
        """
        check = rule.get('check')
        target_name = rule.get('target', 'mapping')
        rule_id = rule.get('id', 'unknown')
        rule_name = rule.get('name', rule_id)
        severity = rule.get('severity', 'warning')

        # Resolve target object
        if target_name == 'type':
            target = ifc_type
        elif target_name == 'mapping':
            target = mapping
        else:
            return None

        # No mapping exists - all mapping-targeted rules fail
        if target is None and target_name == 'mapping':
            return VerificationIssue(
                rule_id=rule_id,
                rule_name=rule_name,
                severity=severity,
                message=f'No classification exists for this type',
            )

        if check == 'has_field':
            field_name = rule.get('field')
            if not field_name:
                return None
            value = getattr(target, field_name, None) if target else None
            if not value or (isinstance(value, str) and not value.strip()):
                return VerificationIssue(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    severity=severity,
                    message=f'Missing: {rule_name}',
                )

        elif check == 'has_related':
            related_name = rule.get('related')
            min_count = rule.get('min_count', 1)
            if not related_name or not target:
                return None
            related = getattr(target, related_name, None)
            if related is None:
                count = 0
            else:
                # Prefetched: use all() which returns cached results
                count = len(list(related.all()))
            if count < min_count:
                return VerificationIssue(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    severity=severity,
                    message=f'Missing: {rule_name} (found {count}, need {min_count})',
                )

        elif check == 'regex':
            field_name = rule.get('field')
            pattern = rule.get('pattern')
            if not field_name or not pattern or not target:
                return None
            value = getattr(target, field_name, '') or ''
            if not re.match(pattern, value):
                return VerificationIssue(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    severity=severity,
                    message=f'Field "{field_name}" does not match pattern: {pattern}',
                )

        elif check == 'value_in':
            field_name = rule.get('field')
            allowed = rule.get('allowed_values', [])
            if not field_name or not allowed or not target:
                return None
            value = getattr(target, field_name, None)
            if value not in allowed:
                return VerificationIssue(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    severity=severity,
                    message=f'Field "{field_name}" value "{value}" not in allowed values',
                )

        return None
