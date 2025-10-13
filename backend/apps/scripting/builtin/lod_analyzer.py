"""
LOD (Level of Development) Analyzer

Analyzes the Level of Development for each element type based on:
- Geometry presence (50% of score)
- Property completeness (50% of score)

LOD Scale:
- LOD 100: Conceptual (0-100 points)
- LOD 200: Approximate Geometry (100-200 points)
- LOD 300: Detailed Geometry (200-300 points)

Parameters: None
"""

# Get all entities
all_entities = list(entities)

# Group by IFC type
types_data = {}

for entity in all_entities:
    ifc_type = entity.ifc_type

    if ifc_type not in types_data:
        types_data[ifc_type] = {
            'count': 0,
            'with_geometry': 0,
            'total_properties': 0,
            'total_vertices': 0,
            'total_triangles': 0,
        }

    data = types_data[ifc_type]
    data['count'] += 1

    if entity.has_geometry:
        data['with_geometry'] += 1
        data['total_vertices'] += entity.vertex_count
        data['total_triangles'] += entity.triangle_count

    # Count properties
    props = get_properties(str(entity.id))
    prop_count = sum(len(pset) for pset in props.values())
    data['total_properties'] += prop_count

# Calculate LOD scores
results = []

for ifc_type, data in types_data.items():
    count = data['count']
    geometry_ratio = data['with_geometry'] / count
    avg_properties = data['total_properties'] / count
    avg_vertices = data['total_vertices'] / max(data['with_geometry'], 1)
    avg_triangles = data['total_triangles'] / max(data['with_geometry'], 1)

    # Calculate LOD score (0-300)
    # 150 points for geometry, 150 points for properties
    geometry_score = geometry_ratio * 150
    property_score = min(avg_properties / 10, 1) * 150  # Cap at 10 properties
    lod_score = int(geometry_score + property_score)

    # Classify LOD level
    if lod_score < 100:
        lod_level = 'LOD 100'
        lod_description = 'Conceptual'
    elif lod_score < 200:
        lod_level = 'LOD 200'
        lod_description = 'Approximate Geometry'
    else:
        lod_level = 'LOD 300'
        lod_description = 'Detailed Geometry'

    results.append({
        'ifc_type': ifc_type,
        'count': count,
        'geometry_ratio': round(geometry_ratio, 2),
        'avg_properties': round(avg_properties, 1),
        'avg_vertices': int(avg_vertices),
        'avg_triangles': int(avg_triangles),
        'lod_score': lod_score,
        'lod_level': lod_level,
        'lod_description': lod_description,
    })

# Sort by count (most common types first)
results.sort(key=lambda x: x['count'], reverse=True)

# Calculate overall model LOD
total_elements = sum(r['count'] for r in results)
weighted_lod = sum(r['lod_score'] * r['count'] for r in results) / total_elements
overall_lod = int(weighted_lod)

if overall_lod < 100:
    overall_level = 'LOD 100'
elif overall_lod < 200:
    overall_level = 'LOD 200'
else:
    overall_level = 'LOD 300'

# Return results
result = {
    'overall_lod_score': overall_lod,
    'overall_lod_level': overall_level,
    'total_element_types': len(results),
    'total_elements': total_elements,
    'by_type': results[:20],  # Top 20 types only
    'summary': f"Overall LOD: {overall_lod} ({overall_level})"
}

# Print report
print("="*60)
print("LOD ANALYSIS REPORT")
print("="*60)
print(f"Overall Model LOD: {overall_lod} ({overall_level})")
print(f"Total Element Types: {len(results)}")
print(f"Total Elements: {total_elements}")
print()
print(f"{'Element Type':<30} {'Count':<8} {'LOD':<12} {'Score':<6}")
print("-"*60)

for r in results[:10]:  # Top 10 types
    print(f"{r['ifc_type']:<30} {r['count']:<8} {r['lod_level']:<12} {r['lod_score']:<6}")

print()
print("Legend:")
print("  LOD 100: Conceptual (0-100 points)")
print("  LOD 200: Approximate Geometry (100-200 points)")
print("  LOD 300: Detailed Geometry (200-300 points)")
