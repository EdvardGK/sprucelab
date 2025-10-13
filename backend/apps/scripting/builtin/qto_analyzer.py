"""
Quantity Take-Off (QTO) Analyzer

Calculates quantities for construction estimation:
- Volumes (m³) for structural elements (walls, slabs, columns, beams)
- Areas (m²) for surfaces (walls, floors, roofs)
- Counts for countable elements (doors, windows, fixtures)
- Lengths (m) for linear elements (pipes, ducts, cables)

Groups quantities by:
- Material (concrete, steel, wood, glass, etc.)
- IFC Type (IfcWall, IfcSlab, etc.)
- Storey (floor level)
- System (HVAC, Plumbing, Electrical, etc.)

Parameters: None
"""

# Note: numpy (np), defaultdict, and other modules are provided in the script context
# No need to import them

# ============================================
# Helper Functions
# ============================================

def calculate_bounding_box_volume(vertices):
    """Calculate volume of bounding box from vertices."""
    if len(vertices) == 0:
        return 0.0

    min_coords = np.min(vertices, axis=0)
    max_coords = np.max(vertices, axis=0)
    dimensions = max_coords - min_coords

    # Volume = length × width × height
    volume = dimensions[0] * dimensions[1] * dimensions[2]
    return float(volume)


def calculate_surface_area(vertices, faces):
    """Calculate total surface area from triangulated mesh."""
    if len(faces) == 0:
        return 0.0

    total_area = 0.0
    for face in faces:
        # Get vertices of triangle
        v0, v1, v2 = vertices[face[0]], vertices[face[1]], vertices[face[2]]

        # Calculate triangle area using cross product
        edge1 = v1 - v0
        edge2 = v2 - v0
        cross = np.cross(edge1, edge2)
        area = 0.5 * np.linalg.norm(cross)
        total_area += area

    return float(total_area)


def calculate_length(vertices):
    """Calculate approximate length from bounding box diagonal."""
    if len(vertices) == 0:
        return 0.0

    min_coords = np.min(vertices, axis=0)
    max_coords = np.max(vertices, axis=0)
    dimensions = max_coords - min_coords

    # Use longest dimension as length
    length = np.max(dimensions)
    return float(length)


def categorize_element(ifc_type):
    """Categorize element into quantity type."""
    volumetric_types = {
        'IfcWall', 'IfcSlab', 'IfcColumn', 'IfcBeam', 'IfcFooting',
        'IfcRoof', 'IfcStair', 'IfcRailing', 'IfcPlate', 'IfcMember'
    }

    area_types = {
        'IfcCovering', 'IfcCurtainWall', 'IfcWindow', 'IfcDoor'
    }

    linear_types = {
        'IfcPipeSegment', 'IfcDuctSegment', 'IfcCableSegment',
        'IfcPipeFitting', 'IfcDuctFitting', 'IfcCableFitting'
    }

    if ifc_type in volumetric_types:
        return 'volumetric'
    elif ifc_type in area_types:
        return 'area'
    elif ifc_type in linear_types:
        return 'linear'
    else:
        return 'countable'


# ============================================
# Main Analysis
# ============================================

print("Starting QTO Analysis...")
print(f"Total entities: {entities.count()}")

# Initialize data structures
qto_data = {
    'by_material': defaultdict(lambda: {'volume_m3': 0, 'area_m2': 0, 'count': 0, 'length_m': 0}),
    'by_type': defaultdict(lambda: {'volume_m3': 0, 'area_m2': 0, 'count': 0, 'length_m': 0}),
    'by_storey': defaultdict(lambda: {'volume_m3': 0, 'area_m2': 0, 'count': 0, 'length_m': 0}),
    'by_system': defaultdict(lambda: {'volume_m3': 0, 'area_m2': 0, 'count': 0, 'length_m': 0}),
}

summary = {
    'total_volume_m3': 0.0,
    'total_area_m2': 0.0,
    'total_count': 0,
    'total_length_m': 0.0,
    'total_types': 0,
    'elements_with_geometry': 0,
    'elements_without_geometry': 0,
}

# Process each entity
for entity in entities:
    summary['total_count'] += 1

    ifc_type = entity.ifc_type
    storey = entity.storey_name or 'Unassigned'
    quantity_category = categorize_element(ifc_type)

    # Get material
    material_name = 'Unspecified'
    try:
        # Get material from MaterialAssignment (provided in context)
        material_assignment = MaterialAssignment.objects.filter(entity=entity).first()
        if material_assignment and material_assignment.material:
            material_name = material_assignment.material.name
    except:
        pass

    # Get system
    system_name = 'None'
    try:
        # Get system membership (provided in context)
        system_membership = SystemMembership.objects.filter(entity=entity).first()
        if system_membership and system_membership.system:
            system_name = system_membership.system.name
    except:
        pass

    # Calculate quantities based on geometry
    volume_m3 = 0.0
    area_m2 = 0.0
    length_m = 0.0

    if entity.has_geometry:
        summary['elements_with_geometry'] += 1

        try:
            # Get geometry
            geom = get_geometry(str(entity.id))
            vertices = geom['vertices']
            faces = geom['faces']

            # Calculate based on category
            if quantity_category == 'volumetric':
                volume_m3 = calculate_bounding_box_volume(vertices)
                summary['total_volume_m3'] += volume_m3

            elif quantity_category == 'area':
                area_m2 = calculate_surface_area(vertices, faces)
                summary['total_area_m2'] += area_m2

            elif quantity_category == 'linear':
                length_m = calculate_length(vertices)
                summary['total_length_m'] += length_m

            # For countable, just count (no quantity calculation)

        except Exception as e:
            # Geometry loading failed, skip
            pass
    else:
        summary['elements_without_geometry'] += 1

    # Update breakdowns
    qto_data['by_material'][material_name]['volume_m3'] += volume_m3
    qto_data['by_material'][material_name]['area_m2'] += area_m2
    qto_data['by_material'][material_name]['length_m'] += length_m
    qto_data['by_material'][material_name]['count'] += 1

    qto_data['by_type'][ifc_type]['volume_m3'] += volume_m3
    qto_data['by_type'][ifc_type]['area_m2'] += area_m2
    qto_data['by_type'][ifc_type]['length_m'] += length_m
    qto_data['by_type'][ifc_type]['count'] += 1

    qto_data['by_storey'][storey]['volume_m3'] += volume_m3
    qto_data['by_storey'][storey]['area_m2'] += area_m2
    qto_data['by_storey'][storey]['length_m'] += length_m
    qto_data['by_storey'][storey]['count'] += 1

    qto_data['by_system'][system_name]['volume_m3'] += volume_m3
    qto_data['by_system'][system_name]['area_m2'] += area_m2
    qto_data['by_system'][system_name]['length_m'] += length_m
    qto_data['by_system'][system_name]['count'] += 1

# Convert defaultdicts to regular lists for JSON serialization
summary['total_types'] = len(set(entity.ifc_type for entity in entities))

result = {
    'summary': summary,
    'by_material': [
        {'name': name, **quantities}
        for name, quantities in sorted(qto_data['by_material'].items(),
                                      key=lambda x: x[1]['volume_m3'], reverse=True)
    ],
    'by_type': [
        {'name': name, **quantities}
        for name, quantities in sorted(qto_data['by_type'].items(),
                                      key=lambda x: x[1]['count'], reverse=True)
    ],
    'by_storey': [
        {'name': name, **quantities}
        for name, quantities in sorted(qto_data['by_storey'].items())
    ],
    'by_system': [
        {'name': name, **quantities}
        for name, quantities in sorted(qto_data['by_system'].items(),
                                      key=lambda x: x[1]['count'], reverse=True)
        if name != 'None'  # Filter out elements not in systems
    ],
}

# Print summary report
print("=" * 70)
print("QUANTITY TAKE-OFF REPORT")
print("=" * 70)
print(f"Total Elements: {summary['total_count']}")
print(f"  - With Geometry: {summary['elements_with_geometry']}")
print(f"  - Without Geometry: {summary['elements_without_geometry']}")
print(f"\nTotal Volume: {summary['total_volume_m3']:.2f} m³")
print(f"Total Area: {summary['total_area_m2']:.2f} m²")
print(f"Total Length: {summary['total_length_m']:.2f} m")
print(f"Unique Element Types: {summary['total_types']}")
print()
print("TOP 5 MATERIALS BY VOLUME:")
print(f"{'Material':<30} {'Volume (m³)':<12} {'Count':<8}")
print("-" * 50)
for item in result['by_material'][:5]:
    print(f"{item['name']:<30} {item['volume_m3']:>10.2f}   {item['count']:>6}")
print()
print("TOP 5 TYPES BY COUNT:")
print(f"{'IFC Type':<30} {'Count':<8} {'Volume (m³)':<12}")
print("-" * 50)
for item in result['by_type'][:5]:
    print(f"{item['name']:<30} {item['count']:>6}   {item['volume_m3']:>10.2f}")
print()
print("✅ QTO Analysis Complete")
