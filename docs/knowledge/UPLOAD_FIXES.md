# Web-IFC Upload Fixes (2025-10-25)

## Issues Fixed

### 1. Duplicate Key Constraint Violation (500 Error)

**Problem**: Uploading the same model multiple times caused database constraint violations.

**Root Causes**:
1. Frontend was extracting duplicate GUIDs due to IFC type hierarchy (IfcWallStandardCase is a subtype of IfcWall)
2. Backend `ignore_conflicts=True` wasn't working reliably in PostgreSQL
3. No deduplication in metadata sent from frontend

**Solutions**:
- **Frontend** (`WebIfcModelUploadDialog.tsx`):
  - Added GUID deduplication using `Map<string, element>` to prevent duplicates within a single upload
  - GUIDs are now unique before sending to backend

- **Backend** (`views.py` - `upload_with_metadata`):
  - Added server-side GUID deduplication as safety check
  - Added fallback to `get_or_create` if `bulk_create` fails
  - Added batch processing (500 entities at a time)
  - Improved error logging with full stack traces

### 2. UI Not Updating After Successful Upload

**Problem**: After successful upload, the models list didn't refresh.

**Root Cause**: Query invalidation was using wrong query key format
- Used: `['projects', projectId, 'models']`
- Should be: `modelKeys.list(projectId)` → `['models', 'list', { projectId }]`

**Solution**:
- Imported `modelKeys` from `use-models.ts`
- Updated query invalidation to use correct key format
- Added invalidation for both specific project list and general models list
- Added visual success feedback with green message box
- Increased dialog close delay to 2 seconds to show success message

## Files Changed

### Frontend
- `frontend/src/components/WebIfcModelUploadDialog.tsx`
  - Added GUID deduplication with Map
  - Fixed query invalidation keys
  - Added success state and message display

### Backend
- `backend/apps/models/views.py`
  - Added GUID deduplication in `upload_with_metadata`
  - Added fallback error handling for bulk inserts
  - Added batch processing
  - Improved error logging

## How Versioning Works

### Auto-Increment Logic (Backend)
```python
# views.py lines 202-207
if version_number:
    version_number = int(version_number)
else:
    latest = Model.objects.filter(project=project, name=name).order_by('-version_number').first()
    version_number = (latest.version_number + 1) if latest else 1
```

### Version Behavior
1. Upload "Building_A.ifc" → Creates **Model v1** (new UUID)
2. Upload "Building_A.ifc" again → Creates **Model v2** (new UUID)
3. Each version is a **separate Model** record with its own entities
4. GUIDs are unique per (model_id, ifc_guid) - same GUID can exist in different versions

### Key Difference: Web-IFC vs Backend Parsing

| Aspect | Old (Backend) | New (Web-IFC) |
|--------|--------------|---------------|
| Parsing | Backend (30s-5min) | Frontend (1-2s) |
| Status | `parsing → parsed → ready` | `parsed/ready` immediately |
| Geometry | Backend extracts | Frontend has it |
| Versioning | ✅ Same | ✅ Same |

## Testing Checklist

- [x] Upload new model → Creates v1
- [x] Upload same model → Creates v2 (no duplicate key error)
- [x] Upload shows success message
- [x] Models list refreshes automatically
- [x] Upload dialog closes after 2 seconds
- [x] Error messages display correctly
- [x] GUID deduplication prevents duplicates from type hierarchy

## Known Limitations

1. **5000 entity limit**: Backend only processes first 5000 elements from metadata
   - Large models (>5000 elements) will have incomplete entity lists
   - Geometry viewer still works (uses frontend data)

2. **Version numbers must be managed manually** if you want to replace a version
   - System always creates new versions
   - No "update existing version" option yet

3. **No automatic cleanup** of old versions
   - Users must manually delete old versions via UI or API

## Future Improvements

- [ ] Add "Replace existing version" option in upload dialog
- [ ] Add pagination for entity bulk inserts (>5000 elements)
- [ ] Add version management UI (compare versions, delete old versions)
- [ ] Add upload progress for large files (currently only shows parsing progress)
- [ ] Add validation feedback before upload (file size, schema version, etc.)
