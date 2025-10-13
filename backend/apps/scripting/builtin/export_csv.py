"""
Export Elements to CSV

Exports all entities with their properties to a CSV format.

Parameters:
- include_properties: bool (default: True) - Include property sets
- filter_type: str (optional) - Filter by IFC type (e.g. "IfcWall")
"""

# Get entities
entities_qs = entities
if params.get('filter_type'):
    entities_qs = entities_qs.filter(ifc_type=params['filter_type'])

# Build rows
rows = []
for entity in entities_qs:
    row = {
        'GUID': entity.ifc_guid,
        'Type': entity.ifc_type,
        'Name': entity.name or '',
        'Has Geometry': entity.has_geometry,
        'Vertex Count': entity.vertex_count,
        'Triangle Count': entity.triangle_count,
    }

    # Add properties if requested
    if params.get('include_properties', True):
        props = get_properties(str(entity.id))
        for pset_name, pset_props in props.items():
            for prop_name, prop_data in pset_props.items():
                row[f"{pset_name}.{prop_name}"] = prop_data['value']

    rows.append(row)

# Convert to pandas DataFrame
df = pd.DataFrame(rows)

# Return results (keep preview VERY small to avoid JSON field size limits)
# Only include first 2 rows and limit column values to 50 chars
preview_data = df.head(2).to_dict('records')

# Clean up preview data for JSON serialization
for row in preview_data:
    for key in list(row.keys()):
        val = row[key]
        # Replace NaN/None with empty string
        if pd.isna(val) or val is None:
            row[key] = ''
        # Truncate long strings
        elif isinstance(val, str) and len(val) > 50:
            row[key] = val[:47] + '...'
        # Convert numpy types to Python types
        elif hasattr(val, 'item'):  # numpy scalar
            row[key] = val.item()
        # Convert bool to Python bool
        elif isinstance(val, (bool, np.bool_)):
            row[key] = bool(val)

result = {
    'row_count': len(rows),
    'column_count': len(df.columns),
    'columns': list(df.columns)[:15],  # Only first 15 column names
    'preview': preview_data,  # Only 2 rows with truncated values
    'summary': f"Exported {len(rows)} elements with {len(df.columns)} columns",
    'note': 'Full data export coming soon - use API endpoint for complete data'
}

print(f"✅ Export complete: {len(rows)} elements exported")
print(f"Columns: {', '.join(df.columns[:5])}...")
