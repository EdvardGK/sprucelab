# Django Test Scripts

Collection of utility scripts for debugging and testing the Django backend.

## Scripts

### check_model_status.py

Check the status of the latest uploaded model in the database.

**Usage:**
```bash
conda activate sprucelab
cd backend
python ../django-test/check_model_status.py
```

**What it shows:**
- Model ID, name, status
- IFC schema version
- Element/storey/system counts
- File information
- Processing error messages (if any)
- Validation report count
- Extracted entities and geometry count

This helps diagnose issues with IFC file processing.

### reset_stuck_model.py

Reset a model stuck in "processing" state back to "error" so it can be re-uploaded.

**Usage:**
```bash
# Reset model by name (default: G55_RIE)
python django-test/reset_stuck_model.py

# Reset specific model by name
python django-test/reset_stuck_model.py "Your Model Name"
```

**What it does:**
- Finds the most recent model with the given name stuck in `processing` state
- Shows how long it's been stuck
- Resets status to `error` with timeout message
- Allows re-upload or investigation

**When to use:** When a model appears stuck in "processing" state for extended periods (Celery worker crashed, timeout, etc.)

### test_scripts.py

Test the script execution system with real models and scripts.

**Usage:**
```bash
# Test single script execution
python django-test/test_scripts.py

# Test all scripts
python django-test/test_scripts.py --all

# Check database status
python django-test/test_scripts.py --check
```

**What it does:**
- **Default**: Executes first script on first ready model, shows full output
- **--all**: Tests all scripts in database, shows summary
- **--check**: Shows models, scripts, and recent executions

**Expected output:**
```
============================================================
TESTING SINGLE SCRIPT EXECUTION
============================================================

✅ Found model: Your Model Name
   Elements: 142

✅ Found script: Export Elements to CSV
   Category: export

🚀 Executing script...

============================================================
EXECUTION COMPLETE
============================================================
Status: success
Duration: 1234ms

📊 Result Data:
   row_count: 142
   column_count: 8
   summary: Exported 142 elements
```

---

## Session 014: Federated Viewer Scripts

Scripts for testing and verifying the federated viewer implementation.

### test_viewer_api.py

Create sample viewer configuration and test API endpoints.

**Usage:**
```bash
# From project root (recommended)
python django-test/test_viewer_api.py

# Or from backend directory
cd backend
python ../django-test/test_viewer_api.py
```

**What it does:**
- Creates test project with 4 IFC models (ARK, HVAC, STR, Landscape)
- Creates federated viewer "Site Overview"
- Creates hierarchical group structure:
  - Building A (with nested ARK, HVAC, STR groups)
  - Landscape
- Assigns models to groups with coordination data
- Tests API serialization
- Displays viewer tree structure
- Lists all available API endpoints

**Expected output:**
```
============================================================
Federated Viewer API Test
============================================================

📁 Step 1: Setting up test project...
   ✓ Project: Test Project - Federated Viewer (created)

📐 Step 2: Setting up test models...
   ✓ Model: ARK_Building_A_v3.ifc (created)
   ✓ Model: HVAC_Bygg1_v2.ifc (created)
   ✓ Model: STR_BuildingA_v1.ifc (created)
   ✓ Model: Landscape_Site.ifc (created)

🎨 Step 3: Creating viewer configuration...
   ✓ Viewer: Site Overview (created)

📂 Step 4: Creating viewer groups...
   ✓ Group: Building A
   ✓ Group: Landscape
   ✓ Group: Building A → Architecture
   ✓ Group: Building A → HVAC
   ✓ Group: Building A → Structure

🔗 Step 5: Assigning models to groups...
   ✓ ARK_Building_A_v3.ifc → Architecture
   ✓ HVAC_Bygg1_v2.ifc → HVAC [#FF5733]
   ✓ STR_BuildingA_v1.ifc → Structure
   ✓ Landscape_Site.ifc → Landscape (100, 50, 0) [#2ECC71]

🔍 Step 6: Testing API serialization...
   ✓ Viewer: Site Overview
   ✓ Project: Test Project - Federated Viewer
   ✓ Total Groups: 5
   ✓ Total Models: 4
   ✓ Top-level Groups: 2

🌳 Step 7: Viewer tree structure:

   📁 Site Overview
      └─ 📁 Building A (building)
         └─ 📁 Architecture (discipline)
            └─ 📐 ARK_Building_A_v3.ifc 👁️
         └─ 📁 HVAC (discipline)
            └─ 📐 HVAC_Bygg1_v2.ifc 👁️ [#FF5733]
         └─ 📁 Structure (discipline)
            └─ 📐 STR_BuildingA_v1.ifc 👁️
      └─ 📁 Landscape (zone)
         └─ 📐 Landscape_Site.ifc 👁️ [#2ECC71] (offset)

✅ Step 8: API endpoints available:

   Viewer Configuration:
      GET    /api/viewers/
      POST   /api/viewers/
      GET    /api/viewers/{id}/
      PATCH  /api/viewers/{id}/
      DELETE /api/viewers/{id}/

   Viewer Groups:
      GET    /api/viewers/groups/
      POST   /api/viewers/groups/
      POST   /api/viewers/groups/reorder/

   Viewer Models:
      GET    /api/viewers/models/
      POST   /api/viewers/models/
      POST   /api/viewers/models/{id}/coordinate/
      POST   /api/viewers/models/batch-coordinate/

============================================================
✅ Test Complete - Federated Viewer API Ready!
============================================================
```

**When to use:** After running migrations for viewer app

---

## Session 011: MMI-veileder 2.0 Scripts

Scripts for testing and verifying the MMI-veileder 2.0 implementation.

### delete_old_pofin_templates.py

Delete old POFIN templates with incorrect MMI scale (5 levels only).

**Usage:**
```bash
# From project root (recommended)
python django-test/delete_old_pofin_templates.py

# Or from backend directory
cd backend
python ../django-test/delete_old_pofin_templates.py
```

**What it does:**
- Finds old POFIN templates ('POFIN Standard Building', 'POFIN Infrastructure/Roads')
- Shows details (ID, version, MMI levels)
- Prompts for confirmation before deletion
- Deletes templates and all related data (cascading)
- Lists remaining BEP configurations

**When to use:** After running migration, before loading new templates

---

### verify_mmi_templates.py

Verify MMI-veileder 2.0 templates are loaded correctly with official colors.

**Usage:**
```bash
# From project root (recommended)
python django-test/verify_mmi_templates.py

# Or from backend directory
cd backend
python ../django-test/verify_mmi_templates.py
```

**What it checks:**
- ✅ Full template exists (19 levels: 0, 100, 125...500, 600)
- ✅ Simplified template exists (6 levels: 100, 200, 300, 350, 400, 500)
- ✅ All color codes match official MMI-veileder 2.0 Table 1
- ✅ English names (name_en) present
- ✅ Database schema has new fields (color_hex, color_rgb, name_en)
- ✅ Displays all levels with colors in formatted table

**When to use:** After loading new templates

**Expected output:**
```
======================================================================
MMI-VEILEDER 2.0 TEMPLATE VERIFICATION
======================================================================

1. MMI-veileder 2.0 - Full Scale Template
----------------------------------------------------------------------
✅ Found: MMI-veileder 2.0 - Full Scale
   MMI Levels: 19
   ✅ Correct count (19 levels)

   All Levels:
     MMI   0: Grunnlagsinformasjon              #CCCCCC  ✅ ✅
     MMI 100: Konseptinformasjon                #BE2823  ✅ ✅
     ...

4. Official Color Code Verification
----------------------------------------------------------------------
Checking official colors match MMI-veileder 2.0 Table 1:
  ✅ MMI 100: #BE2823 (correct)
  ✅ MMI 200: #ED9D3D (correct)
  ...
```

---

### test_mmi_flexibility.py

Test MMI scale flexibility with extreme values (0-2000 range).

**Usage:**
```bash
# From project root (recommended)
python django-test/test_mmi_flexibility.py

# Or from backend directory
cd backend
python ../django-test/test_mmi_flexibility.py
```

**What it tests:**
- ✅ Creates custom MMI levels: 0, 50, 750, 1500, 2000
- ✅ Rejects invalid values: -1, 2001, 9999
- ✅ Verifies color_hex and name_en storage
- ✅ Tests MMI analyzer compatibility with any scale
- ✅ Creates temporary test BEP (prompts for cleanup)

**When to use:** After migration, to verify database accepts full 0-2000 range

**Expected output:**
```
======================================================================
MMI SCALE FLEXIBILITY TEST
======================================================================

1. Creating BEP with Custom MMI Levels
----------------------------------------------------------------------
Created BEP: Custom MMI Scale Test (ID: xyz...)

Creating test MMI levels:
  ✅ MMI    0: Raw Data
  ✅ MMI   50: Pre-concept
  ✅ MMI  750: Mid-range Custom
  ✅ MMI 1500: High Custom
  ✅ MMI 2000: Maximum

2. Testing Invalid MMI Values (Should Fail)
----------------------------------------------------------------------
  ✅ MMI   -1: Correctly rejected (Negative value)
  ✅ MMI 2001: Correctly rejected (Above maximum (2000))
  ✅ MMI 9999: Correctly rejected (Way above maximum)

TEST SUMMARY
======================================================================
✅ PASSED: Custom MMI levels (0, 50, 750, 1500, 2000)
✅ PASSED: Invalid values rejected (-1, 2001, 9999)
✅ MMI scale is fully flexible (0-2000 range)
```

---

## Session 011 Workflow

Complete workflow for implementing MMI-veileder 2.0:

### Step 1: Run Migration
```bash
cd backend
python manage.py migrate bep
```

### Step 2: Delete Old Templates
```bash
python django-test/delete_old_pofin_templates.py
```

### Step 3: Load New Templates
```bash
cd backend

# Load both new templates
python manage.py load_bep_templates --template=mmi-full
python manage.py load_bep_templates --template=mmi-simple

# Or load all at once (includes old POFIN, Infrastructure, ISO19650)
python manage.py load_bep_templates --template=all
```

### Step 4: Verify Templates
```bash
python django-test/verify_mmi_templates.py
```

### Step 5: Test Flexibility (Optional)
```bash
python django-test/test_mmi_flexibility.py
```

---

## How Scripts Work

All scripts in this directory are **standalone Python scripts** that initialize Django themselves. They can be run directly with `python script.py` - no Django shell or bash redirection needed.

**Primary Method** (PowerShell/Windows compatible):
```bash
# From project root
python django-test/SCRIPT_NAME.py

# Or from backend directory
cd backend
python ../django-test/SCRIPT_NAME.py
```

**How it works:**
Each script includes Django setup boilerplate:
```python
import os
import sys
import django

# Add backend directory to path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_dir)

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# Now can import Django models
from apps.bep.models import BEPConfiguration
```

This pattern ensures scripts work on:
- ✅ Windows PowerShell
- ✅ Linux/Mac bash
- ✅ Any directory (automatically finds backend)
- ✅ No need for `manage.py shell` or pipes

---

**Last Updated**: Session 014 (2025-10-13)
