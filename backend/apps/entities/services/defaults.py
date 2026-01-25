"""
Default configuration for scope management and validation.

Provides auto-excluded entities, type patterns, and scope defaults
that can be overridden by project-specific configurations.
"""
import json
import fnmatch
from pathlib import Path
from functools import lru_cache


@lru_cache(maxsize=1)
def load_auto_excluded():
    """Load auto-excluded defaults from JSON file."""
    data_file = Path(__file__).parent.parent / 'data' / 'auto_excluded.json'
    if data_file.exists():
        with open(data_file, 'r') as f:
            return json.load(f)
    return {}


def get_excluded_entities():
    """Get list of IFC entity classes that are auto-excluded."""
    data = load_auto_excluded()
    return data.get('entities', {}).get('list', [])


def get_excluded_patterns():
    """Get list of type name patterns that are auto-excluded."""
    data = load_auto_excluded()
    return data.get('type_patterns', {}).get('list', [])


def get_measurement_rules():
    """Get default measurement unit rules by IFC class."""
    data = load_auto_excluded()
    return data.get('measurement_rules', {})


def get_scope_defaults(scope_type):
    """Get default scope settings for a validation type."""
    data = load_auto_excluded()
    return data.get('scope_defaults', {}).get(scope_type, {})


def is_auto_excluded_entity(ifc_class):
    """Check if an IFC class is auto-excluded."""
    excluded = get_excluded_entities()
    return ifc_class in excluded


def is_auto_excluded_pattern(type_name):
    """Check if a type name matches any auto-excluded pattern."""
    if not type_name:
        return False
    patterns = get_excluded_patterns()
    for pattern in patterns:
        if fnmatch.fnmatch(type_name, pattern):
            return True
    return False


def should_auto_exclude(ifc_class, type_name):
    """
    Check if a type should be auto-excluded from scope.

    Returns: (bool, reason) tuple
    """
    if is_auto_excluded_entity(ifc_class):
        return True, 'auto_entity'
    if is_auto_excluded_pattern(type_name):
        return True, 'auto_pattern'
    return False, None


def get_measurement_unit(ifc_class):
    """
    Get the default measurement unit for an IFC class.

    Returns: 'count', 'length', 'area', 'volume', or None
    """
    rules = get_measurement_rules()
    for unit, classes in rules.items():
        if unit == 'description':
            continue
        if ifc_class in classes:
            return unit
    return None


class ScopeResolver:
    """
    Resolves scope for a type based on priority rules.

    Priority order:
    1. Project config explicit overrides (in/out lists)
    2. Auto-excluded entity classes
    3. Auto-excluded type name patterns
    4. Default: 'unknown' (requires manual decision)
    """

    def __init__(self, project_config=None):
        """
        Initialize with optional project config.

        Args:
            project_config: ProjectConfig instance or dict with config data
        """
        self.config = {}
        if project_config:
            if hasattr(project_config, 'config'):
                self.config = project_config.config
            else:
                self.config = project_config

    def resolve(self, ifc_class, type_name, scope_type='tfm'):
        """
        Resolve scope for a type.

        Args:
            ifc_class: IFC entity class (e.g., 'IfcDuctSegment')
            type_name: Type name from model
            scope_type: Validation context ('tfm', 'lca', 'qto', 'clash')

        Returns:
            tuple: (status, reason)
            - status: 'in', 'out', 'auto_excluded', 'unknown'
            - reason: 'config_in', 'config_out', 'auto_entity', 'auto_pattern', 'default'
        """
        # Priority 1: Project config explicit overrides
        type_scope = self.config.get('type_scope', {}).get(scope_type, {})

        # Check 'out' list first (explicit exclusions)
        out_list = type_scope.get('out', [])
        for pattern in out_list:
            if fnmatch.fnmatch(type_name, pattern):
                return 'out', 'config_out'

        # Check 'in' list (explicit inclusions)
        in_list = type_scope.get('in', [])
        for pattern in in_list:
            if fnmatch.fnmatch(type_name, pattern):
                return 'in', 'config_in'

        # Priority 2 & 3: Auto-excluded
        excluded, reason = should_auto_exclude(ifc_class, type_name)
        if excluded:
            return 'auto_excluded', reason

        # Priority 4: Default
        return 'unknown', 'default'

    def resolve_batch(self, types, scope_type='tfm'):
        """
        Resolve scope for multiple types.

        Args:
            types: List of (ifc_class, type_name) tuples
            scope_type: Validation context

        Returns:
            dict: {type_name: (status, reason)}
        """
        return {
            type_name: self.resolve(ifc_class, type_name, scope_type)
            for ifc_class, type_name in types
        }
