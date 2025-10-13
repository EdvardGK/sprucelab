"""
MMI (Model Maturity Index) Analyzer - Norwegian POFIN Standard

Analyzes model maturity based on project's BEP (BIM Execution Plan) configuration.
Uses Norwegian buildingSMART POFIN framework with MMI scale: 100, 300, 350, 400, 500.

**NEW IN v2**: This script reads MMI scale definitions from the project's active BEP,
making it project-specific and standards-compliant.

How it works:
1. Get project's active BEP
2. Get MMI scale definitions from BEP (100, 300, 350, 400, 500)
3. For each element, check which MMI level it meets
4. Return Norwegian MMI levels and gap analysis

Groups analysis by:
- IFC Type
- Storey (floor level)
- System (HVAC, Plumbing, Electrical, etc.)

Parameters: None
"""

# Note: numpy (np), defaultdict, and other modules are provided in the script context
# No need to import them

# ============================================
# BEP-Based MMI Evaluation
# ============================================

def check_geometry_requirements(entity, geom_reqs):
    """
    Check if entity meets BEP geometry requirements.

    Args:
        entity: IFCEntity object
        geom_reqs: dict from BEP MMI definition geometry_requirements

    Returns:
        (bool, list of failures)
    """
    failures = []

    # Check if 3D geometry is required
    if geom_reqs.get('requires_3d', False):
        if not entity.has_geometry:
            failures.append('no_3d_geometry')
            return False, failures

    # Check minimum vertex count
    min_vertices = geom_reqs.get('min_vertex_count', 0)
    if min_vertices > 0:
        vertex_count = entity.vertex_count or 0
        if vertex_count < min_vertices:
            failures.append(f'insufficient_vertices (has {vertex_count}, needs {min_vertices})')
            return False, failures

    # Check collision-ready (has geometry with sufficient detail)
    if geom_reqs.get('collision_ready', False):
        if not entity.has_geometry:
            failures.append('not_collision_ready')
            return False, failures
        # Collision-ready implies reasonable vertex count
        if (entity.vertex_count or 0) < 8:
            failures.append('insufficient_detail_for_collision')
            return False, failures

    return True, []


def check_information_requirements(entity, info_reqs):
    """
    Check if entity meets BEP information requirements.

    Args:
        entity: IFCEntity object
        info_reqs: dict from BEP MMI definition information_requirements

    Returns:
        (bool, list of failures)
    """
    failures = []

    # Check name requirement
    if info_reqs.get('requires_name', False):
        if not entity.name:
            failures.append('missing_name')
            return False, failures

    # Check description requirement
    if info_reqs.get('requires_description', False):
        if not entity.description:
            failures.append('missing_description')
            return False, failures

    # Check classification requirement
    if info_reqs.get('requires_classification', False):
        # For now, check if element has a name (placeholder for real classification check)
        # TODO: Add proper classification system check
        if not entity.name:
            failures.append('missing_classification')
            return False, failures

    # Check material requirement
    if info_reqs.get('requires_material', False):
        try:
            if not MaterialAssignment.objects.filter(entity=entity).exists():
                failures.append('missing_material')
                return False, failures
        except:
            failures.append('missing_material')
            return False, failures

    # Check system membership requirement
    if info_reqs.get('requires_system_membership', False):
        try:
            if not SystemMembership.objects.filter(entity=entity).exists():
                failures.append('missing_system_membership')
                return False, failures
        except:
            failures.append('missing_system_membership')
            return False, failures

    # Check minimum property count
    min_properties = info_reqs.get('min_property_count', 0)
    if min_properties > 0:
        try:
            props = get_properties(str(entity.id))
            prop_count = sum(len(pset) for pset in props.values()) if props else 0
            if prop_count < min_properties:
                failures.append(f'insufficient_properties (has {prop_count}, needs {min_properties})')
                return False, failures
        except:
            failures.append('property_check_failed')
            return False, failures

    return True, []


def calculate_element_mmi(entity, mmi_definitions):
    """
    Calculate MMI level for an element based on BEP definitions.

    The element's MMI is the highest level where it meets ALL requirements.
    We iterate through levels from lowest to highest and stop at the first failure.

    Args:
        entity: IFCEntity object
        mmi_definitions: QuerySet of MMIScaleDefinition objects (ordered by mmi_level)

    Returns:
        (mmi_level, failures_dict)
    """
    element_mmi = 0  # Default: doesn't meet any level
    all_failures = {}

    for mmi_def in mmi_definitions:
        geom_reqs = mmi_def.geometry_requirements or {}
        info_reqs = mmi_def.information_requirements or {}

        # Check geometry requirements
        geom_pass, geom_failures = check_geometry_requirements(entity, geom_reqs)

        # Check information requirements
        info_pass, info_failures = check_information_requirements(entity, info_reqs)

        # If both pass, element meets this MMI level
        if geom_pass and info_pass:
            element_mmi = mmi_def.mmi_level
            all_failures[mmi_def.mmi_level] = []  # No failures at this level
        else:
            # Element doesn't meet this level, stop here
            all_failures[mmi_def.mmi_level] = geom_failures + info_failures
            break  # Stop at first level not met

    return element_mmi, all_failures


# ============================================
# Main Analysis
# ============================================

print("Starting BEP-Based MMI Analysis...")
print(f"Total entities: {entities.count()}")

# Get active BEP for the project
try:
    # Get the model's project
    # Note: 'model' is provided in script context
    project = model.project
    print(f"Project: {project.name}")

    # Get active BEP
    bep = project.get_active_bep()

    if not bep:
        raise Exception(f"Project '{project.name}' has no active BEP. Please create and activate a BEP first.")

    print(f"Using BEP: {bep.name} (v{bep.version})")
    print(f"Framework: {bep.framework}")

except Exception as e:
    print(f"❌ ERROR: {str(e)}")
    result = {
        'error': str(e),
        'message': 'Cannot run MMI analysis without an active BEP',
        'help': 'Please create a BEP for this project using: python manage.py load_bep_templates --project-id=<project-uuid>'
    }
    # Exit early - can't continue without BEP

# Get MMI scale definitions from BEP
mmi_definitions = bep.mmi_scale.all().order_by('mmi_level')

if not mmi_definitions.exists():
    print("❌ ERROR: BEP has no MMI scale definitions")
    result = {
        'error': 'BEP has no MMI scale definitions',
        'message': 'The BEP needs to define MMI levels (100, 300, 350, 400, 500)',
    }
    # Exit early

print(f"\nMMI Scale Definitions ({mmi_definitions.count()} levels):")
for mmi_def in mmi_definitions:
    print(f"  MMI {mmi_def.mmi_level}: {mmi_def.name}")

# Get target MMI from BEP (highest level defined)
highest_mmi_level = mmi_definitions.last().mmi_level
TARGET_MMI = highest_mmi_level
print(f"\nTarget MMI: {TARGET_MMI}")

# Initialize data structures
mmi_data = {
    'by_type': defaultdict(lambda: {
        'count': 0,
        'total_mmi': 0,
        'mmi_distribution': defaultdict(int)
    }),
    'by_storey': defaultdict(lambda: {
        'count': 0,
        'total_mmi': 0,
        'mmi_distribution': defaultdict(int)
    }),
    'by_system': defaultdict(lambda: {
        'count': 0,
        'total_mmi': 0,
        'mmi_distribution': defaultdict(int)
    }),
}

summary = {
    'total_elements': 0,
    'mmi_distribution': defaultdict(int),
}

gaps = []

# Process each entity
print(f"\nAnalyzing {entities.count()} elements...")

for entity in entities:
    summary['total_elements'] += 1

    # Calculate MMI using BEP definitions
    element_mmi, failures = calculate_element_mmi(entity, mmi_definitions)

    summary['mmi_distribution'][element_mmi] += 1

    # Store element reference for gap analysis
    if element_mmi < TARGET_MMI:
        # Find what's missing (failures at the next level)
        next_level_failures = []
        for level, level_failures in failures.items():
            if level > element_mmi and level_failures:
                next_level_failures = level_failures
                break

        gaps.append({
            'guid': entity.ifc_guid,
            'name': entity.name or 'Unnamed',
            'type': entity.ifc_type,
            'mmi': element_mmi,
            'storey': entity.storey_name or 'Unassigned',
            'missing': next_level_failures
        })

    # Group by type
    ifc_type = entity.ifc_type
    mmi_data['by_type'][ifc_type]['count'] += 1
    mmi_data['by_type'][ifc_type]['total_mmi'] += element_mmi
    mmi_data['by_type'][ifc_type]['mmi_distribution'][element_mmi] += 1

    # Group by storey
    storey = entity.storey_name or 'Unassigned'
    mmi_data['by_storey'][storey]['count'] += 1
    mmi_data['by_storey'][storey]['total_mmi'] += element_mmi
    mmi_data['by_storey'][storey]['mmi_distribution'][element_mmi] += 1

    # Group by system
    try:
        system_membership = SystemMembership.objects.filter(entity=entity).first()
        if system_membership and system_membership.system:
            system_name = system_membership.system.name
            mmi_data['by_system'][system_name]['count'] += 1
            mmi_data['by_system'][system_name]['total_mmi'] += element_mmi
            mmi_data['by_system'][system_name]['mmi_distribution'][element_mmi] += 1
    except:
        pass

# Calculate overall MMI (weighted average)
if summary['total_elements'] > 0:
    total_mmi_sum = sum(mmi * count for mmi, count in summary['mmi_distribution'].items())
    overall_mmi = round(total_mmi_sum / summary['total_elements'])
else:
    overall_mmi = 0

# Get description for overall MMI
overall_mmi_def = mmi_definitions.filter(mmi_level=overall_mmi).first()
if overall_mmi_def:
    overall_description = f"MMI {overall_mmi}: {overall_mmi_def.name}"
else:
    overall_description = f"MMI {overall_mmi}"

# Convert data to JSON-serializable format
result = {
    'bep_info': {
        'bep_id': str(bep.id),
        'bep_name': bep.name,
        'bep_version': bep.version,
        'framework': bep.framework,
    },
    'mmi_scale': [
        {
            'mmi_level': mmi_def.mmi_level,
            'name': mmi_def.name,
            'description': mmi_def.description,
        }
        for mmi_def in mmi_definitions
    ],
    'overall_mmi': overall_mmi,
    'overall_description': overall_description,
    'total_elements': summary['total_elements'],
    'target_mmi': TARGET_MMI,
    'elements_below_target': len(gaps),
    'progress_percentage': round((1 - len(gaps) / summary['total_elements']) * 100, 1) if summary['total_elements'] > 0 else 0,
    'mmi_distribution': [
        {
            'mmi': mmi,
            'count': count,
            'percentage': round(count / summary['total_elements'] * 100, 1)
        }
        for mmi, count in sorted(summary['mmi_distribution'].items())
    ],
    'by_type': [
        {
            'name': name,
            'count': data['count'],
            'avg_mmi': round(data['total_mmi'] / data['count']) if data['count'] > 0 else 0,
            'mmi_distribution': dict(data['mmi_distribution'])
        }
        for name, data in sorted(mmi_data['by_type'].items(), key=lambda x: x[1]['count'], reverse=True)
    ],
    'by_storey': [
        {
            'name': name,
            'count': data['count'],
            'avg_mmi': round(data['total_mmi'] / data['count']) if data['count'] > 0 else 0,
            'mmi_distribution': dict(data['mmi_distribution'])
        }
        for name, data in sorted(mmi_data['by_storey'].items())
    ],
    'by_system': [
        {
            'name': name,
            'count': data['count'],
            'avg_mmi': round(data['total_mmi'] / data['count']) if data['count'] > 0 else 0,
            'mmi_distribution': dict(data['mmi_distribution'])
        }
        for name, data in sorted(mmi_data['by_system'].items(), key=lambda x: x[1]['count'], reverse=True)
    ],
    'gaps': sorted(gaps, key=lambda x: x['mmi'])[:50],  # Top 50 elements needing improvement
}

# Print summary report
print("\n" + "=" * 70)
print("MMI ANALYSIS REPORT (BEP-Based)")
print("=" * 70)
print(f"BEP: {bep.name} (v{bep.version})")
print(f"Framework: {bep.framework}")
print(f"\nOverall Model MMI: {overall_mmi} ({overall_description})")
print(f"Total Elements: {summary['total_elements']}")
print(f"Target MMI: {TARGET_MMI}")
print(f"Elements Below Target: {len(gaps)} ({len(gaps)/summary['total_elements']*100:.1f}%)")
print()
print("MMI DISTRIBUTION:")
for item in result['mmi_distribution']:
    bar = '█' * int(item['percentage'] / 2)
    print(f"  MMI {item['mmi']:>3}: {item['count']:>4} ({item['percentage']:>5.1f}%) {bar}")
print()
print("TOP 5 TYPES BY COUNT:")
print(f"{'IFC Type':<30} {'Count':<8} {'Avg MMI'}")
print("-" * 50)
for item in result['by_type'][:5]:
    print(f"{item['name']:<30} {item['count']:>6}   {item['avg_mmi']:>7}")
print()
if gaps:
    print(f"TOP 10 ELEMENTS NEEDING IMPROVEMENT (Target: MMI {TARGET_MMI}):")
    print(f"{'Type':<20} {'Name':<20} {'MMI':<6} {'Missing'}")
    print("-" * 70)
    for gap in gaps[:10]:
        missing_str = ', '.join(gap['missing'])[:30] if gap['missing'] else 'N/A'
        name_truncated = gap['name'][:18] + '..' if len(gap['name']) > 20 else gap['name']
        print(f"{gap['type']:<20} {name_truncated:<20} {gap['mmi']:>4}   {missing_str}")
print()
print("✅ BEP-Based MMI Analysis Complete")
