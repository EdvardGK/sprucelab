# Session 025 - Model Versioning Enhancement

**Date**: 2024-12-14
**Focus**: GUID-based entity UPSERT and IFC timestamp warnings

## Summary

Implemented model versioning enhancement with:
1. IFC timestamp extraction and comparison
2. Warning when uploading older model files
3. GUID-based entity UPSERT (update existing, create new, soft-delete removed)
4. Version diff tracking

## Changes Made

### 1. Backend Model Fields

**Model** (`backend/apps/models/models.py`):
- `ifc_timestamp` - DateTimeField for IFC file timestamp from IfcOwnerHistory
- `version_diff` - JSONField for tracking added/updated/removed entities

**IFCEntity** (`backend/apps/entities/models.py`):
- `is_removed` - BooleanField for soft delete when entity not in new file
- Added index on `is_removed` for query performance

### 2. IFC Timestamp Extraction

**Helper function** (`backend/apps/models/services/parse.py`):
```python
def _extract_ifc_timestamp(ifc_file):
    """Extract timestamp from IfcOwnerHistory.LastModifiedDate or CreationDate."""
    owner_histories = ifc_file.by_type('IfcOwnerHistory')
    if owner_histories:
        timestamp = oh.LastModifiedDate or oh.CreationDate
        if timestamp:
            return datetime.fromtimestamp(timestamp)
    return None
```

### 3. GUID-Based Entity UPSERT

Replaced `bulk_create(..., ignore_conflicts=True)` with UPSERT pattern:

```python
# Pre-fetch existing entities by GUID
existing_by_guid = {e.ifc_guid: e for e in IFCEntity.objects.filter(model=model)}

# For each element in IFC file:
if guid in existing_by_guid:
    # UPDATE existing entity (preserves user data like enrichment_status)
    to_update.append(existing)
else:
    # CREATE new entity
    to_create.append(IFCEntity(...))

# Batch operations
IFCEntity.objects.bulk_create(to_create)
IFCEntity.objects.bulk_update(to_update, fields=[...])

# Soft-delete removed entities
removed_guids = set(existing_by_guid.keys()) - seen_guids
IFCEntity.objects.filter(ifc_guid__in=removed_guids).update(is_removed=True)
```

**Fields updated from IFC** (not preserved):
- express_id, ifc_type, predefined_type, object_type, name, description
- storey_id, area, volume, length, height, perimeter

**Fields preserved** (user data):
- enrichment_status, validation_status, warehouse assignments, notes

### 4. Timestamp Comparison in Upload

**Upload view** (`backend/apps/models/views.py`):
- Quick extraction of IFC timestamp before processing
- Comparison with parent_model.ifc_timestamp
- Warning in response if new file is older

```python
version_warning = {
    'type': 'older_file',
    'message': 'Denne modellen er eldre enn den nåværende versjonen',
    'current_version_timestamp': '...',
    'uploaded_file_timestamp': '...',
}
```

### 5. Frontend Version Warning UI

**ModelUploadDialog** (`frontend/src/components/ModelUploadDialog.tsx`):
- Shows yellow warning alert when uploading older file
- Displays timestamps in Norwegian locale format
- Shows "Lukk" button after successful upload with warning

**Hook types** (`frontend/src/hooks/use-models.ts`):
- Added `VersionWarning` interface
- Added `UploadResponse` interface with version_warning field

## Files Modified

| File | Changes |
|------|---------|
| `backend/apps/models/models.py` | Added `ifc_timestamp`, `version_diff` fields |
| `backend/apps/entities/models.py` | Added `is_removed` field with index |
| `backend/apps/models/services/parse.py` | Added timestamp extraction, UPSERT pattern |
| `backend/apps/models/views.py` | Added timestamp comparison, version warning |
| `backend/apps/models/serializers.py` | Added new fields to serializer |
| `frontend/src/hooks/use-models.ts` | Added VersionWarning types |
| `frontend/src/components/ModelUploadDialog.tsx` | Added warning UI |

## Migration

Created migration: `0010_add_version_tracking`
- Model: ifc_timestamp, version_diff
- IFCEntity: is_removed, is_removed index

## Norwegian Messages

- Older file: "Denne modellen er eldre enn den nåværende versjonen"
- Same timestamp: "Denne modellen har samme tidsstempel som forrige versjon"
- UI labels: "Nåværende versjon", "Opplastet fil", "Lukk"

## Version Diff Format

After parsing, model.version_diff contains:
```json
{
  "entities": {
    "created": 50,
    "updated": 200,
    "removed": 5,
    "total": 250
  }
}
```

## Testing

### Test Results

**Upload v6** (after fix):
```json
{
  "version_number": 6,
  "ifc_timestamp": "2025-11-17T08:30:46Z",
  "parent_model": "66b6edd4-0658-4617-840e-caf5b1fd8149"
}
```
✅ Timestamp extracted from IFC file

**Upload v7** (same file again):
```json
{
  "version_number": 7,
  "ifc_timestamp": "2025-11-17T08:30:46Z",
  "version_warning": {
    "type": "same_timestamp",
    "message": "Denne modellen har samme tidsstempel som forrige versjon",
    "current_version_timestamp": "2025-11-17T08:30:46+00:00",
    "uploaded_file_timestamp": "2025-11-17T08:30:46+00:00"
  }
}
```
✅ Warning triggered for same timestamp

## Bug Fixes During Testing

### 1. Timezone-naive vs timezone-aware comparison
**Error**: `can't compare offset-naive and offset-aware datetimes`

**Fix**: Changed `datetime.fromtimestamp(timestamp)` to use Django's `timezone.make_aware()`:
```python
naive_dt = datetime.fromtimestamp(timestamp)
return timezone.make_aware(naive_dt)
```

### 2. Invalid timezone attribute
**Error**: `AttributeError: module 'django.utils.timezone' has no attribute 'utc'`

**Fix**: Removed `timezone.utc` parameter, `make_aware()` uses default timezone:
```python
# Before (wrong)
return timezone.make_aware(naive_dt, timezone.utc)

# After (correct)
return timezone.make_aware(naive_dt)
```

## Manual Test Steps

1. Upload a model (creates v1)
2. Upload same model name with older IFC timestamp (creates v2 with warning)
3. Check version_diff in model details
4. Verify entities are updated (not duplicated)
5. Verify removed entities have is_removed=True

---

## i18n Implementation

### Strategy Added

Added i18n strategy section to `CLAUDE.md` documenting:
- react-i18next with locale files (en.json, nb.json)
- All user-facing text MUST use translation keys
- Never hardcode Norwegian strings

### ModelUploadDialog Refactored

Updated `ModelUploadDialog.tsx` to use proper i18n:

**Before**: Hardcoded Norwegian strings
```tsx
<AlertTitle>Advarsel</AlertTitle>
<span>Nåværende versjon:</span>
<Button>Lukk</Button>
```

**After**: Translation keys
```tsx
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();

<AlertTitle>{t('modelUpload.warning')}</AlertTitle>
<span>{t('modelUpload.currentVersion')}:</span>
<Button>{t('common.close')}</Button>
```

### Translation Keys Added

Added `modelUpload` section to both locale files:

| Key | English | Norwegian |
|-----|---------|-----------|
| `title` | Upload IFC Model | Last opp IFC-modell |
| `description` | Upload a new IFC model... | Last opp en ny IFC-modell... |
| `dropzone` | Drop IFC file here or click to browse | Slipp IFC-fil her eller klikk for å bla |
| `maxSize` | Maximum file size: 1GB | Maksimal filstørrelse: 1GB |
| `modelName` | Model Name | Modellnavn |
| `warning` | Warning | Advarsel |
| `success` | Success | Suksess |
| `olderVersion` | This model is older than... | Denne modellen er eldre... |
| `sameTimestamp` | This model has the same... | Denne modellen har samme... |
| `currentVersion` | Current version | Nåværende versjon |
| `uploadedFile` | Uploaded file | Opplastet fil |
| `uploadedSuccess` | The model has been uploaded... | Modellen er lastet opp... |
| `processing` | The model has been uploaded... | Modellen er lastet opp... |

### Files Modified for i18n

| File | Changes |
|------|---------|
| `CLAUDE.md` | Added i18n strategy section |
| `frontend/src/i18n/locales/en.json` | Added modelUpload section |
| `frontend/src/i18n/locales/nb.json` | Added modelUpload section |
| `frontend/src/components/ModelUploadDialog.tsx` | Replaced hardcoded strings with t() calls |
