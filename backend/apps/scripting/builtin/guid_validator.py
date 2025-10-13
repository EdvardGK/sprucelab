"""
GUID Validation Check

Checks for duplicate GUIDs and invalid GUID format.

IFC GUIDs must be:
- Exactly 22 characters
- Base64 encoded (alphanumeric, _, $)
- Unique across the model

Parameters: None
"""

# Note: re module is provided in the script context
# No need to import it

# Get all entities
all_entities = list(entities)

# Track GUIDs
guid_counts = {}
invalid_format = []
duplicates = []

# GUID format regex (22 chars, base64)
guid_pattern = re.compile(r'^[0-9A-Za-z_$]{22}$')

for entity in all_entities:
    guid = entity.ifc_guid

    # Check format
    if not guid_pattern.match(guid):
        invalid_format.append({
            'guid': guid,
            'type': entity.ifc_type,
            'name': entity.name or 'N/A'
        })

    # Count occurrences
    if guid not in guid_counts:
        guid_counts[guid] = []
    guid_counts[guid].append({
        'id': str(entity.id),
        'type': entity.ifc_type,
        'name': entity.name or 'N/A'
    })

# Find duplicates
for guid, occurrences in guid_counts.items():
    if len(occurrences) > 1:
        duplicates.append({
            'guid': guid,
            'count': len(occurrences),
            'elements': occurrences
        })

# Calculate statistics
total_elements = len(all_entities)
unique_guids = len(guid_counts)
duplicate_count = len(duplicates)
invalid_count = len(invalid_format)

# Determine overall status
if duplicate_count > 0 or invalid_count > 0:
    status = 'FAIL'
elif total_elements == unique_guids:
    status = 'PASS'
else:
    status = 'WARNING'

# Return results
result = {
    'status': status,
    'total_elements': total_elements,
    'unique_guids': unique_guids,
    'duplicate_guids': duplicate_count,
    'invalid_format': invalid_count,
    'duplicates_list': duplicates[:10],  # First 10 only
    'invalid_list': invalid_format[:10],  # First 10 only
    'summary': f"Status: {status} - {duplicate_count} duplicates, {invalid_count} invalid formats"
}

# Print summary
print("="*50)
print("GUID VALIDATION REPORT")
print("="*50)
print(f"Total Elements: {total_elements}")
print(f"Unique GUIDs: {unique_guids}")
print(f"Duplicate GUIDs: {duplicate_count}")
print(f"Invalid Format: {invalid_count}")
print(f"\nOverall Status: {status}")

if duplicate_count > 0:
    print(f"\n⚠️ Found {duplicate_count} duplicate GUIDs!")
    print(f"First duplicate: {duplicates[0]['guid']} ({duplicates[0]['count']} occurrences)")

if invalid_count > 0:
    print(f"\n⚠️ Found {invalid_count} invalid GUID formats!")
    print(f"First invalid: {invalid_format[0]['guid']}")

if status == 'PASS':
    print("\n✅ All GUIDs are unique and valid!")
