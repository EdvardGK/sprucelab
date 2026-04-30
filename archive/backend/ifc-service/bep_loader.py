"""
BEP Rules Loader - Load validation rules from database.

Queries the Django BEP tables to load rules for a specific model/project.
"""

from typing import Optional, List
import logging

from core.database import fetch_all, fetch_one
from models.validation_schemas import (
    BEPRules,
    LoadedValidationRule,
    LoadedRequiredPset,
    LoadedNamingConvention,
    LoadedTechnicalRequirement,
    PropertyValidation,
    RuleType,
    Severity,
)

logger = logging.getLogger(__name__)


# SQL Queries
GET_MODEL_PROJECT = """
SELECT project_id FROM models WHERE id = $1
"""

GET_ACTIVE_BEP = """
SELECT id, name, project_id
FROM bep_configurations
WHERE project_id = $1 AND status = 'active'
LIMIT 1
"""

GET_BEP_BY_ID = """
SELECT id, name, project_id
FROM bep_configurations
WHERE id = $1
"""

GET_VALIDATION_RULES = """
SELECT
    id::text,
    rule_code,
    name,
    description,
    rule_type,
    severity,
    rule_definition,
    applies_to_ifc_types,
    applies_to_disciplines,
    min_mmi_level,
    error_message_template,
    is_active
FROM validation_rules
WHERE bep_id = $1 AND is_active = true
ORDER BY severity, rule_code
"""

GET_REQUIRED_PSETS = """
SELECT
    id::text,
    ifc_type,
    mmi_level,
    pset_name,
    required_properties,
    optional_properties,
    applies_to_disciplines,
    severity,
    is_required
FROM required_property_sets
WHERE bep_id = $1 AND is_required = true
ORDER BY ifc_type, mmi_level
"""

GET_NAMING_CONVENTIONS = """
SELECT
    id::text,
    category,
    name,
    description,
    pattern,
    pattern_type,
    examples,
    applies_to_disciplines,
    is_required,
    error_message
FROM naming_conventions
WHERE bep_id = $1
ORDER BY category
"""

GET_TECHNICAL_REQUIREMENTS = """
SELECT
    ifc_schema,
    max_file_size_mb
FROM technical_requirements
WHERE bep_id = $1
"""


class BEPRulesLoader:
    """Load validation rules from BEP database tables."""

    async def load_rules_for_model(
        self,
        model_id: str,
        bep_id: Optional[str] = None,
    ) -> Optional[BEPRules]:
        """
        Load all rules for a model's project.

        If bep_id is None, finds the project's active BEP.

        Args:
            model_id: UUID of the Model
            bep_id: Optional UUID of specific BEP to use

        Returns:
            BEPRules containing all loaded rules, or None if no BEP found
        """
        try:
            # Get the BEP to use
            if bep_id:
                bep_record = await fetch_one(GET_BEP_BY_ID, bep_id)
                if not bep_record:
                    logger.warning(f"BEP not found: {bep_id}")
                    return None
            else:
                # Get project ID from model
                model_record = await fetch_one(GET_MODEL_PROJECT, model_id)
                if not model_record:
                    logger.warning(f"Model not found: {model_id}")
                    return None

                project_id = str(model_record['project_id'])

                # Get active BEP for project
                bep_record = await fetch_one(GET_ACTIVE_BEP, project_id)
                if not bep_record:
                    logger.info(f"No active BEP for project: {project_id}")
                    return None

            bep_id = str(bep_record['id'])
            bep_name = bep_record['name']
            project_id = str(bep_record['project_id'])

            logger.info(f"Loading rules from BEP: {bep_name} ({bep_id})")

            # Load all rule types in parallel
            validation_rules = await self._load_validation_rules(bep_id)
            required_psets = await self._load_required_psets(bep_id)
            naming_conventions = await self._load_naming_conventions(bep_id)
            tech_requirements = await self._load_technical_requirements(bep_id)

            return BEPRules(
                bep_id=bep_id,
                bep_name=bep_name,
                project_id=project_id,
                validation_rules=validation_rules,
                required_psets=required_psets,
                naming_conventions=naming_conventions,
                technical_requirements=tech_requirements,
            )

        except Exception as e:
            logger.error(f"Error loading BEP rules: {e}")
            raise

    async def _load_validation_rules(self, bep_id: str) -> List[LoadedValidationRule]:
        """Load ValidationRule records from database."""
        rows = await fetch_all(GET_VALIDATION_RULES, bep_id)
        rules = []

        for row in rows:
            try:
                rule = LoadedValidationRule(
                    id=row['id'],
                    rule_code=row['rule_code'],
                    name=row['name'],
                    description=row['description'] or '',
                    rule_type=RuleType(row['rule_type']),
                    severity=Severity(row['severity']),
                    rule_definition=row['rule_definition'] or {},
                    applies_to_ifc_types=row['applies_to_ifc_types'] or [],
                    applies_to_disciplines=row['applies_to_disciplines'] or [],
                    min_mmi_level=row['min_mmi_level'],
                    error_message_template=row['error_message_template'] or 'Validation failed',
                    is_active=row['is_active'],
                )
                rules.append(rule)
            except Exception as e:
                logger.warning(f"Skipping invalid rule {row.get('rule_code')}: {e}")

        logger.info(f"Loaded {len(rules)} validation rules")
        return rules

    async def _load_required_psets(self, bep_id: str) -> List[LoadedRequiredPset]:
        """Load RequiredPropertySet records from database."""
        rows = await fetch_all(GET_REQUIRED_PSETS, bep_id)
        psets = []

        for row in rows:
            try:
                # Parse required_properties into PropertyValidation objects
                raw_props = row['required_properties'] or []
                required_properties = []
                for prop in raw_props:
                    if isinstance(prop, dict):
                        pv = PropertyValidation(
                            name=prop.get('name', ''),
                            type=prop.get('type'),
                            required=prop.get('required', True),
                            pattern=prop.get('pattern'),
                            min_value=prop.get('min_value'),
                            max_value=prop.get('max_value'),
                            allowed_values=prop.get('allowed_values'),
                        )
                        required_properties.append(pv)
                    elif isinstance(prop, str):
                        # Simple string = property name only
                        required_properties.append(PropertyValidation(name=prop))

                pset = LoadedRequiredPset(
                    id=row['id'],
                    ifc_type=row['ifc_type'],
                    mmi_level=row['mmi_level'],
                    pset_name=row['pset_name'],
                    required_properties=required_properties,
                    optional_properties=row['optional_properties'] or [],
                    applies_to_disciplines=row['applies_to_disciplines'] or [],
                    severity=Severity(row['severity']),
                    is_required=row['is_required'],
                )
                psets.append(pset)
            except Exception as e:
                logger.warning(f"Skipping invalid pset {row.get('pset_name')}: {e}")

        logger.info(f"Loaded {len(psets)} required property sets")
        return psets

    async def _load_naming_conventions(self, bep_id: str) -> List[LoadedNamingConvention]:
        """Load NamingConvention records from database."""
        rows = await fetch_all(GET_NAMING_CONVENTIONS, bep_id)
        conventions = []

        for row in rows:
            try:
                convention = LoadedNamingConvention(
                    id=row['id'],
                    category=row['category'],
                    name=row['name'],
                    description=row['description'] or '',
                    pattern=row['pattern'],
                    pattern_type=row['pattern_type'],
                    examples=row['examples'] or [],
                    applies_to_disciplines=row['applies_to_disciplines'] or [],
                    is_required=row['is_required'],
                    error_message=row['error_message'] or 'Name does not match convention',
                )
                conventions.append(convention)
            except Exception as e:
                logger.warning(f"Skipping invalid naming convention {row.get('name')}: {e}")

        logger.info(f"Loaded {len(conventions)} naming conventions")
        return conventions

    async def _load_technical_requirements(self, bep_id: str) -> Optional[LoadedTechnicalRequirement]:
        """Load TechnicalRequirement from database."""
        row = await fetch_one(GET_TECHNICAL_REQUIREMENTS, bep_id)

        if not row:
            return None

        return LoadedTechnicalRequirement(
            ifc_schema=row['ifc_schema'],
            max_file_size_mb=row['max_file_size_mb'] or 500,
        )


# Singleton instance
bep_loader = BEPRulesLoader()
