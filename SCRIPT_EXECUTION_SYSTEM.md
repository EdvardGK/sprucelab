# Script Execution System - Implementation Complete ✅

**Session 006 - Backend Phase Complete**
**Date**: 2025-10-13

---

## What We've Built

### ✅ Database Schema (4 Tables)
- `scripts` - Script library
- `script_executions` - Execution history
- `automation_workflows` - Automated workflows
- `workflow_executions` - Workflow history

### ✅ Script Execution Engine
- **Context Builder** (`services/context.py`) - Provides scripts with model data access
- **Script Runner** (`services/runner.py`) - Executes Python code with sandboxing
- **Security** - Restricted builtins, no file/network access

### ✅ Built-in Scripts (3)
1. **Export Elements to CSV** - Export entities with properties
2. **GUID Validation Check** - Check for duplicate/invalid GUIDs
3. **LOD Analyzer** - Analyze Level of Development by element type

### ✅ Management Tools
- Load built-in scripts command
- Test execution script
- Django admin interfaces

---

## Next Steps: Test the System

### 1. Load Built-in Scripts into Database

```bash
cd /mnt/host/c/Users/edkjo/theSpruceForgeDevelopment/projects/active/ifc-extract-3d-mesh/backend

python manage.py load_builtin_scripts
```

**Expected Output:**
```
Created: Export Elements to CSV
Created: GUID Validation Check
Created: LOD Analyzer

✅ Loaded 3 built-in scripts
```

### 2. Test Script Execution

**Option A: Django Shell (Interactive)**
```bash
python manage.py shell
```

Then in the Python shell:
```python
from apps.scripting.test_execution import test_script_execution

# Test one script
test_script_execution()

# Or test all scripts
from apps.scripting.test_execution import test_all_scripts
test_all_scripts()
```

**Option B: Direct Python Script**
```bash
python manage.py shell < apps/scripting/test_execution.py
```

### 3. Verify in Django Admin

```bash
# Start server if not running
python manage.py runserver
```

Visit: http://127.0.0.1:8000/admin/

Navigate to:
- **Scripts** → See 3 built-in scripts
- **Script executions** → See execution history

---

## How It Works

### Script Execution Flow

1. **User triggers execution**
   - Via API endpoint (coming next)
   - Or manually: `execute_script(script_id, model_id, parameters)`

2. **ScriptExecution record created**
   - Status: `queued`
   - Parameters stored

3. **Context built**
   - Model data loaded (entities, properties, systems, etc.)
   - Helper functions provided (get_geometry, get_properties, save_output)
   - Whitelisted libraries (numpy, pandas, ifcopenshell)

4. **Script executed**
   - Status changed to `running`
   - Code executed with restricted globals (no open, exec, eval, etc.)
   - stdout/stderr captured

5. **Results saved**
   - Status: `success` or `error`
   - Output log, result data, duration saved
   - Available via API or admin

### What Scripts Can Access

```python
# Model data (QuerySets)
entities      # All IFCEntity objects for this model
properties    # All PropertySet objects
systems       # All System objects
materials     # All Material objects
types         # All IFCType objects

# Helper functions
get_geometry(entity_id)    # Load vertices and faces
get_properties(entity_id)  # Get property sets
save_output(filename, data)  # Save result file (TODO)

# Libraries
np, numpy    # NumPy
pd, pandas   # Pandas
ifcopenshell # IFC parsing

# User parameters
params       # Dictionary of user-provided parameters
```

### Example: GUID Validator Script

```python
import re

# Get all entities
all_entities = list(entities)

# Track GUIDs
guid_counts = {}
invalid_format = []

# GUID format regex
guid_pattern = re.compile(r'^[0-9A-Za-z_$]{22}$')

for entity in all_entities:
    guid = entity.ifc_guid

    # Check format
    if not guid_pattern.match(guid):
        invalid_format.append({
            'guid': guid,
            'type': entity.ifc_type
        })

    # Count occurrences
    if guid not in guid_counts:
        guid_counts[guid] = []
    guid_counts[guid].append(entity)

# Find duplicates
duplicates = [g for g, els in guid_counts.items() if len(els) > 1]

# Return results
result = {
    'total_elements': len(all_entities),
    'unique_guids': len(guid_counts),
    'duplicate_guids': len(duplicates),
    'invalid_format': len(invalid_format)
}

print(f"Status: {'PASS' if not duplicates else 'FAIL'}")
```

---

## Files Created (Session 006 Backend)

**Models & Migration:**
- `apps/scripting/models.py` (230 lines) - 4 database models
- `apps/scripting/admin.py` (109 lines) - Django admin
- `apps/scripting/migrations/0001_initial.py` - Database migration

**Services:**
- `apps/scripting/services/context.py` (140 lines) - Context builder
- `apps/scripting/services/runner.py` (180 lines) - Script executor

**Built-in Scripts:**
- `apps/scripting/builtin/export_csv.py` (40 lines)
- `apps/scripting/builtin/guid_validator.py` (80 lines)
- `apps/scripting/builtin/lod_analyzer.py` (120 lines)

**Management:**
- `apps/scripting/management/commands/load_builtin_scripts.py` - Load scripts
- `apps/scripting/test_execution.py` - Test utilities

**Total: ~900 lines of code**

---

## Architecture Decisions

### Security Model

**Current (MVP):**
- Python `exec()` with restricted builtins
- No `open()`, `eval()`, `exec()`, `import os`, etc.
- Whitelisted libraries only (numpy, pandas, ifcopenshell)
- 5-minute timeout (not enforced yet)

**Future (Production):**
- Execute in subprocess with timeout
- Or run in Docker container
- File system isolation
- Network isolation
- Memory limits

### Script Storage

**Current:**
- Scripts stored as TEXT in database
- Code updated via admin or API
- Built-in scripts loaded from .py files

**Future:**
- Version control for scripts (git-like)
- Script templates library
- User-shared scripts marketplace

### Result Storage

**Current:**
- Results stored in ScriptExecution.result_data (JSON)
- Logs stored in ScriptExecution.output_log (TEXT)
- Files not yet uploaded to storage

**Future:**
- Upload result files to Supabase Storage
- Download endpoint for result files
- Automatic cleanup after 30 days

---

## Next Phase: API Endpoints

**Coming Next:**
1. Scripts API (GET, POST, PATCH, DELETE)
2. Execute script endpoint (POST /api/models/{id}/execute-script/)
3. Execution history endpoint (GET /api/models/{id}/script-executions/)
4. Execution details endpoint (GET /api/script-executions/{id}/)

Then we can build the frontend **Scripts Tab** to execute scripts from the UI!

---

## Troubleshooting

### Scripts Not Found
```bash
# Reload scripts
python manage.py load_builtin_scripts
```

### Execution Fails
Check Django admin → Script executions → View error_message

### No Models Found
Upload an IFC file first:
```bash
# Via API
POST /api/models/upload/
```

---

**Status**: ✅ Backend script execution system complete and ready for testing!

**Next Actions:**
1. Run `python manage.py load_builtin_scripts`
2. Test execution with `test_script_execution()`
3. Verify in Django admin
4. Move to API endpoints

**Last Updated**: 2025-10-13 (Session 006)
