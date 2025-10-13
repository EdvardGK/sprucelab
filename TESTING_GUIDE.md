# Testing Guide: IFC Upload and Processing

## What Was Implemented

### Backend Files Created/Modified (Session 003)

**New Files:**
1. `backend/apps/models/serializers.py` - Model, ModelUpload, ModelDetail serializers
2. `backend/apps/models/views.py` - ModelViewSet with upload endpoint
3. `backend/apps/models/services.py` - IFC extraction service (full pipeline)
4. `backend/apps/entities/serializers.py` - Entity, PropertySet, System, Material, Type serializers

**Modified Files:**
1. `backend/apps/models/urls.py` - Registered ModelViewSet routes

**Directories Created:**
1. `backend/media/ifc_files/` - File upload storage

### API Endpoints Available

```
GET    /api/projects/              # List all projects
POST   /api/projects/              # Create project
GET    /api/projects/{id}/         # Get project details

GET    /api/models/                # List all models
POST   /api/models/upload/         # Upload IFC file ⭐
GET    /api/models/{id}/           # Get model details
GET    /api/models/{id}/status/    # Get processing status
GET    /api/models/{id}/elements/  # Get model elements (paginated)
```

## Testing Steps

### 1. Start Django Server

```bash
# Activate conda environment
conda activate sprucelab

# Navigate to backend
cd backend

# Start server
python manage.py runserver
```

You should see:
```
System check identified no issues (0 silenced).
Django version X.X, using settings 'config.settings'
Starting development server at http://127.0.0.1:8000/
```

### 2. Test Basic Endpoints (Browser)

Open in browser:
- http://127.0.0.1:8000/api/projects/
- http://127.0.0.1:8000/api/models/
- http://127.0.0.1:8000/admin/ (login with your credentials)

You should see Django REST Framework browsable API.

### 3. Create a Test Project

**Using Browser (DRF Browsable API):**
1. Go to http://127.0.0.1:8000/api/projects/
2. Scroll down to the form
3. Fill in:
   - name: "Test Project"
   - description: "Testing IFC upload"
4. Click POST

**Using curl:**
```bash
curl -X POST http://127.0.0.1:8000/api/projects/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "Testing IFC upload"}'
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "name": "Test Project",
  "description": "Testing IFC upload",
  "model_count": 0,
  "element_count": 0,
  "latest_version": null,
  "created_at": "2025-10-11T...",
  "updated_at": "2025-10-11T..."
}
```

**Save the project ID** - you'll need it for upload!

### 4. Upload an IFC File

⚠️ **Use a SMALL file first** (< 1MB, < 100 elements) for testing!

**Using curl:**
```bash
# Replace PROJECT_ID with the UUID from step 3
# Replace PATH_TO_FILE with your IFC file path

curl -X POST http://127.0.0.1:8000/api/models/upload/ \
  -F "file=@PATH_TO_FILE.ifc" \
  -F "project_id=PROJECT_ID" \
  -F "name=Test Model v1"
```

**Using Python:**
```python
import requests

project_id = "your-project-uuid-here"
file_path = "path/to/your/file.ifc"

with open(file_path, 'rb') as f:
    response = requests.post(
        'http://127.0.0.1:8000/api/models/upload/',
        files={'file': f},
        data={
            'project_id': project_id,
            'name': 'Test Model v1'
        }
    )

print(response.status_code)
print(response.json())
```

**Expected Response (Success):**
```json
{
  "model": {
    "id": "model-uuid",
    "project": "project-uuid",
    "name": "Test Model v1",
    "status": "ready",
    "ifc_schema": "IFC2X3",
    "element_count": 42,
    "storey_count": 3,
    "system_count": 2,
    ...
  },
  "message": "File uploaded and processed successfully. 42 elements extracted."
}
```

**Expected Response (Error):**
```json
{
  "model": {
    "id": "model-uuid",
    "status": "error",
    "processing_error": "Error message here",
    ...
  },
  "message": "File uploaded but processing failed: ..."
}
```

### 5. Verify Data in Database

**Check in Admin Panel:**
1. Go to http://127.0.0.1:8000/admin/
2. Login with your superuser account
3. Navigate to:
   - Projects → Should see "Test Project"
   - Models → Should see your uploaded model
   - IFC Entities → Should see extracted elements
   - Property Sets → Should see extracted properties

**Check via API:**
```bash
# Get model details
curl http://127.0.0.1:8000/api/models/MODEL_ID/

# Get model status
curl http://127.0.0.1:8000/api/models/MODEL_ID/status/

# Get model elements (first 100)
curl http://127.0.0.1:8000/api/models/MODEL_ID/elements/

# Get model elements filtered by type
curl "http://127.0.0.1:8000/api/models/MODEL_ID/elements/?type=IfcWall"
```

## What Gets Extracted

The extraction service processes:

1. **Spatial Hierarchy** (stored in `spatial_hierarchy` table)
   - IfcProject
   - IfcSite
   - IfcBuilding
   - IfcBuildingStorey

2. **Materials** (stored in `materials` table)
   - All IfcMaterial objects

3. **Type Objects** (stored in `ifc_types` table)
   - All IfcTypeObject (WallType, DoorType, etc.)

4. **Systems** (stored in `systems` table)
   - All IfcSystem objects

5. **Elements** (stored in `ifc_entities` table)
   - All IfcElement objects with geometry
   - Bounding box calculated for each
   - Storey assignment resolved

6. **Geometry** (stored in `geometry` table)
   - Vertices as binary blob (numpy array)
   - Faces as binary blob (numpy array)
   - Vertex and face counts stored separately

7. **Property Sets** (stored in `property_sets` table)
   - All Psets for all elements
   - Individual properties as rows

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'django'"
**Solution:** Activate conda environment first:
```bash
conda activate sprucelab
```

### Issue: "Project with ID X does not exist"
**Solution:** Create a project first (step 3)

### Issue: "Only IFC files are supported"
**Solution:** Make sure file has .ifc extension

### Issue: "File too large. Maximum size is 1GB"
**Solution:** Use a smaller file or adjust MAX_UPLOAD_SIZE in settings.py

### Issue: Processing fails with geometry extraction error
**Possible causes:**
- Corrupted IFC file
- Unsupported IFC schema version
- Elements with invalid geometry definitions

**Check console output for detailed error messages**

### Issue: Database connection error
**Solution:** Verify DATABASE_URL in `.env` file is correct

## Expected Processing Times

**Small file (< 100 elements):** 2-5 seconds
**Medium file (100-1000 elements):** 10-60 seconds
**Large file (1000+ elements):** 1-10 minutes

⚠️ **Note:** Processing is currently **synchronous** (blocks the request). For large files, this will timeout. Redis + Celery needed for async processing of large files.

## Next Steps After Successful Test

1. ✅ Upload endpoint working
2. ✅ Data extracted to database
3. ⏳ Install Redis for background processing
4. ⏳ Configure Celery for async processing
5. ⏳ Build React frontend
6. ⏳ Implement 3D viewer
7. ⏳ Implement graph visualization
8. ⏳ Implement change detection

## Files to Check for Errors

If something goes wrong, check these locations:

**Django console output** - Shows real-time processing errors

**Log file:** `backend/logs/django.log`

**Database** - Use admin panel to inspect:
- http://127.0.0.1:8000/admin/

**Uploaded files:** `backend/media/ifc_files/`

## Sample Test Commands (All in One)

```bash
# 1. Start server (in one terminal)
conda activate sprucelab
cd backend
python manage.py runserver

# 2. Create project (in another terminal)
PROJECT_RESPONSE=$(curl -s -X POST http://127.0.0.1:8000/api/projects/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "description": "Testing"}')

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.id')
echo "Project ID: $PROJECT_ID"

# 3. Upload IFC file
curl -X POST http://127.0.0.1:8000/api/models/upload/ \
  -F "file=@test.ifc" \
  -F "project_id=$PROJECT_ID" \
  -F "name=Test Model"

# 4. Check models
curl http://127.0.0.1:8000/api/models/

# 5. Get specific model details
curl http://127.0.0.1:8000/api/models/MODEL_ID/
```

---

**Status:** Ready for testing ✅

**Last Updated:** 2025-10-11
