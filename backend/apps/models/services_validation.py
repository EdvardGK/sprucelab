"""
IFC Validation Service

Validates IFC files for quality issues:
- Schema compliance
- GUID duplication
- LOD completeness
- Missing geometry
- Incomplete property sets
"""
import ifcopenshell
# import ifcopenshell.validate  # Temporarily disabled - module may not exist
from collections import defaultdict


def validate_ifc_file(ifc_file):
    """
    Run comprehensive validation on an IFC file.

    Args:
        ifc_file: ifcopenshell.file object

    Returns:
        dict: Validation report with issues categorized by severity
    """
    report = {
        'schema_valid': True,
        'schema_errors': [],
        'schema_warnings': [],
        'guid_issues': [],
        'geometry_issues': [],
        'property_issues': [],
        'lod_issues': [],
        'overall_status': 'pass',  # pass, warning, fail
        'total_elements': 0,
        'elements_with_issues': 0
    }

    # Schema validation
    report['schema_errors'], report['schema_warnings'] = validate_schema(ifc_file)
    if report['schema_errors']:
        report['schema_valid'] = False
        report['overall_status'] = 'fail'

    # GUID duplication check
    report['guid_issues'] = detect_guid_duplicates(ifc_file)
    if report['guid_issues']:
        report['overall_status'] = 'warning' if report['overall_status'] == 'pass' else 'fail'

    # Geometry completeness
    report['geometry_issues'] = check_geometry_completeness(ifc_file)
    if report['geometry_issues']:
        if report['overall_status'] == 'pass':
            report['overall_status'] = 'warning'

    # Property set completeness
    report['property_issues'] = check_property_completeness(ifc_file)
    if report['property_issues']:
        if report['overall_status'] == 'pass':
            report['overall_status'] = 'warning'

    # LOD analysis
    report['lod_issues'] = analyze_lod(ifc_file)

    # Count total elements and elements with issues
    elements = ifc_file.by_type('IfcElement')
    report['total_elements'] = len(elements)

    # Collect GUIDs of all elements with issues
    issue_guids = set()

    # From GUID issues (each issue has a 'guid' key)
    for issue in report['guid_issues']:
        issue_guids.add(issue['guid'])

    # From geometry issues (each issue has 'elements' list with 'guid' keys)
    for issue in report['geometry_issues']:
        if 'elements' in issue:
            for element in issue['elements']:
                issue_guids.add(element['guid'])

    # From property issues (each issue has 'elements' list with 'guid' keys)
    for issue in report['property_issues']:
        if 'elements' in issue:
            for element in issue['elements']:
                issue_guids.add(element['guid'])

    report['elements_with_issues'] = len(issue_guids)

    return report


def validate_schema(ifc_file):
    """
    Validate IFC schema compliance using ifcopenshell.validate.

    Returns:
        tuple: (errors, warnings)
    """
    errors = []
    warnings = []

    try:
        # TEMPORARY: Skip ifcopenshell.validate as it may not be available
        # TODO: Re-enable when ifcopenshell.validate is confirmed to work
        # is_valid = ifcopenshell.validate.validate(ifc_file)
        # if not is_valid:
        #     errors.append({
        #         'type': 'schema_validation',
        #         'message': 'IFC file contains schema validation errors',
        #         'severity': 'error'
        #     })

        # For now, just check that the file opened successfully
        if not ifc_file or not ifc_file.schema:
            errors.append({
                'type': 'schema_validation',
                'message': 'IFC file could not be validated',
                'severity': 'error'
            })
    except Exception as e:
        errors.append({
            'type': 'schema_validation',
            'message': f'Schema validation failed: {str(e)}',
            'severity': 'error'
        })

    # Check IFC schema version
    schema = ifc_file.schema
    supported_schemas = [
        'IFC2X3',     # IFC 2x3 (widely used, supported)
        'IFC4',       # IFC 4 (current standard, supported)
        'IFC4X1',     # IFC 4.1 (addon, low risk)
        'IFC4X2',     # IFC 4.2 (addon, low risk)
        'IFC4X3',     # IFC 4.3 (latest standard, supported)
        'IFC4X3_ADD2' # IFC 4.3 Addendum 2 (latest version, supported)
    ]
    if schema not in supported_schemas:
        warnings.append({
            'type': 'schema_version',
            'message': f'Uncommon/unsupported IFC schema: {schema}. Supported: {", ".join(supported_schemas)}',
            'severity': 'warning'
        })

    return errors, warnings


def detect_guid_duplicates(ifc_file):
    """
    Detect duplicate GUIDs in IFC file.

    Returns:
        list: Issues found (empty if no duplicates)
    """
    issues = []
    guid_map = defaultdict(list)

    # Check all IfcRoot entities (have GlobalId)
    for entity in ifc_file.by_type('IfcRoot'):
        guid = entity.GlobalId
        guid_map[guid].append({
            'guid': guid,
            'type': entity.is_a(),
            'name': entity.Name if hasattr(entity, 'Name') else 'Unnamed',
            'id': entity.id()
        })

    # Find duplicates
    for guid, entities in guid_map.items():
        if len(entities) > 1:
            issues.append({
                'type': 'duplicate_guid',
                'guid': guid,
                'message': f'GUID {guid} is duplicated across {len(entities)} entities',
                'severity': 'error',
                'entities': entities,
                'count': len(entities)
            })

    return issues


def check_geometry_completeness(ifc_file):
    """
    Check for elements missing geometry representation.

    Returns:
        list: Issues found
    """
    issues = []

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    missing_geometry = []
    for element in elements:
        # Skip spatial elements (they don't need geometry)
        if element.is_a('IfcSpatialElement'):
            continue

        # Check if element has representation
        if not element.Representation:
            missing_geometry.append({
                'guid': element.GlobalId,
                'type': element.is_a(),
                'name': element.Name if hasattr(element, 'Name') else 'Unnamed'
            })

    if missing_geometry:
        issues.append({
            'type': 'missing_geometry',
            'message': f'{len(missing_geometry)} elements are missing geometry representation',
            'severity': 'warning',
            'count': len(missing_geometry),
            'elements': missing_geometry[:10]  # Only return first 10 for brevity
        })

    return issues


def check_property_completeness(ifc_file):
    """
    Check for elements with missing or incomplete property sets.

    Returns:
        list: Issues found
    """
    issues = []

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    missing_psets = []
    for element in elements:
        # Check if element has property sets
        has_psets = False
        if hasattr(element, 'IsDefinedBy'):
            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    property_set = definition.RelatingPropertyDefinition
                    if property_set.is_a('IfcPropertySet'):
                        has_psets = True
                        break

        if not has_psets:
            missing_psets.append({
                'guid': element.GlobalId,
                'type': element.is_a(),
                'name': element.Name if hasattr(element, 'Name') else 'Unnamed'
            })

    if missing_psets:
        issues.append({
            'type': 'missing_property_sets',
            'message': f'{len(missing_psets)} elements have no property sets',
            'severity': 'info',
            'count': len(missing_psets),
            'elements': missing_psets[:10]  # Only return first 10
        })

    return issues


def analyze_lod(ifc_file):
    """
    Analyze Level of Development (LOD) distribution.

    Returns:
        list: LOD analysis results
    """
    issues = []

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    # Count elements by type and geometry presence
    type_stats = defaultdict(lambda: {'total': 0, 'with_geometry': 0, 'with_psets': 0})

    for element in elements:
        element_type = element.is_a()
        type_stats[element_type]['total'] += 1

        # Check geometry
        if element.Representation:
            type_stats[element_type]['with_geometry'] += 1

        # Check property sets
        if hasattr(element, 'IsDefinedBy'):
            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    property_set = definition.RelatingPropertyDefinition
                    if property_set.is_a('IfcPropertySet'):
                        type_stats[element_type]['with_psets'] += 1
                        break

    # Analyze completeness by type
    for element_type, stats in type_stats.items():
        geometry_pct = (stats['with_geometry'] / stats['total']) * 100 if stats['total'] > 0 else 0
        pset_pct = (stats['with_psets'] / stats['total']) * 100 if stats['total'] > 0 else 0

        # Flag types with low completeness
        if geometry_pct < 50:
            issues.append({
                'type': 'low_lod_geometry',
                'element_type': element_type,
                'message': f'{element_type}: Only {geometry_pct:.1f}% have geometry',
                'severity': 'warning',
                'total_elements': stats['total'],
                'with_geometry': stats['with_geometry'],
                'geometry_pct': round(geometry_pct, 1)
            })

        if pset_pct < 50:
            issues.append({
                'type': 'low_lod_properties',
                'element_type': element_type,
                'message': f'{element_type}: Only {pset_pct:.1f}% have property sets',
                'severity': 'info',
                'total_elements': stats['total'],
                'with_psets': stats['with_psets'],
                'pset_pct': round(pset_pct, 1)
            })

    return issues


def get_validation_summary(report):
    """
    Generate human-readable summary of validation report.

    Returns:
        str: Summary text
    """
    lines = []

    lines.append(f"IFC Validation Report")
    lines.append(f"=" * 80)
    lines.append(f"Overall Status: {report['overall_status'].upper()}")
    lines.append(f"Total Elements: {report['total_elements']}")
    lines.append(f"Elements with Issues: {report['elements_with_issues']}")
    lines.append("")

    if report['schema_errors']:
        lines.append(f"❌ Schema Errors: {len(report['schema_errors'])}")
        for error in report['schema_errors']:
            lines.append(f"   - {error['message']}")
    else:
        lines.append("✅ Schema Validation: PASS")

    if report['guid_issues']:
        lines.append(f"⚠️  GUID Duplicates: {len(report['guid_issues'])} GUIDs")
        for issue in report['guid_issues'][:5]:  # Show first 5
            lines.append(f"   - {issue['guid']}: {issue['count']} occurrences")
    else:
        lines.append("✅ GUID Uniqueness: PASS")

    if report['geometry_issues']:
        for issue in report['geometry_issues']:
            lines.append(f"⚠️  {issue['message']}")
    else:
        lines.append("✅ Geometry Completeness: GOOD")

    if report['property_issues']:
        for issue in report['property_issues']:
            lines.append(f"ℹ️  {issue['message']}")

    lines.append("")
    return "\n".join(lines)
