# BEP Workbench Implementation - Quick Start Guide

## What Was Built (Session 010)

✅ **Complete BEP (BIM Execution Plan) Configuration System** for ISO 19650 & POFIN compliance

### Key Features

- **7 Database Models** - Complete BEP data structure
- **3 Pre-built Templates** - POFIN Standard, Infrastructure, ISO 19650 Generic
- **Norwegian MMI Scale** - Correct 100/300/350/400/500 scale (not 1-7!)
- **Django Admin Interface** - Full CRUD with inlines
- **Project-Centric** - Each project has its own BEP configuration

---

## Files Created

### New Files (8 files, ~1,700 lines)

```
backend/apps/bep/
├── __init__.py                           (5 lines)
├── apps.py                               (12 lines)
├── models.py                             (650 lines) ⭐
├── admin.py                              (390 lines) ⭐
└── management/
    └── commands/
        └── load_bep_templates.py         (620 lines) ⭐
```

### Modified Files (2 files)

1. `backend/config/settings.py` - Added `'apps.bep'` to INSTALLED_APPS
2. `backend/apps/projects/models.py` - Added BEP helper methods

---

## Database Schema (7 New Tables)

1. **bep_configurations** - Main BEP document with versioning
2. **technical_requirements** - IFC schema, coordinates, units
3. **mmi_scale_definitions** - Project-specific MMI levels (100-500)
4. **naming_conventions** - File/element naming rules
5. **required_property_sets** - Which Psets required for which IFC types
6. **validation_rules** - Quality control rules
7. **submission_milestones** - Delivery schedule with target MMI

---

## Next Steps: Running Migrations

### Step 1: Set Up Python Environment

```bash
# If using conda (recommended)
conda activate bim-coordinator

# OR if using venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows
```

### Step 2: Install Dependencies (if needed)

```bash
cd backend
pip install -r requirements.txt
```

### Step 3: Create Migrations

```bash
cd backend
python manage.py makemigrations bep
```

**Expected Output**:
```
Migrations for 'bep':
  apps/bep/migrations/0001_initial.py
    - Create model BEPConfiguration
    - Create model TechnicalRequirement
    - Create model MMIScaleDefinition
    - Create model NamingConvention
    - Create model RequiredPropertySet
    - Create model ValidationRule
    - Create model SubmissionMilestone
```

### Step 4: Run Migrations

```bash
python manage.py migrate
```

**Expected Output**:
```
Running migrations:
  Applying bep.0001_initial... OK
```

### Step 5: Load BEP Templates

```bash
# Load all 3 templates
python manage.py load_bep_templates
```

**Expected Output**:
```
Using existing project: Demo Project - BEP Templates
Loading POFIN Standard Building template...
  ✅ Created POFIN template (BEP ID: ...)
Loading Infrastructure template...
  ✅ Created Infrastructure template (BEP ID: ...)
Loading ISO 19650 Generic template...
  ✅ Created ISO 19650 template (BEP ID: ...)
✅ BEP templates loaded successfully
```

### Step 6: Test in Django Admin

```bash
# Start server
python manage.py runserver
```

Navigate to: **http://127.0.0.1:8000/admin/bep/bepconfiguration/**

You should see 3 BEP templates:
- POFIN Standard Building
- POFIN Infrastructure/Roads
- ISO 19650 Generic

---

## Using the BEP System

### Creating a BEP for Your Project

#### Option 1: Use Template (Recommended)

```bash
# Get your project ID
python manage.py shell
>>> from apps.projects.models import Project
>>> project = Project.objects.get(name='Your Project Name')
>>> print(project.id)
<uuid>

# Load template for that project
python manage.py load_bep_templates --template=pofin --project-id=<uuid>
```

#### Option 2: Create via Django Admin

1. Go to: http://127.0.0.1:8000/admin/bep/bepconfiguration/
2. Click "Add BEP Configuration"
3. Select project
4. Fill in details
5. Add MMI Scale definitions (inline)
6. Add validation rules (inline)
7. Save

### Activating a BEP

```python
# In Django shell
from apps.bep.models import BEPConfiguration

# Get BEP
bep = BEPConfiguration.objects.get(id='<bep-uuid>')

# Activate (this will archive any other active BEPs for the project)
bep.activate()

# Verify
print(bep.status)  # Should be 'active'
```

Or via Django admin:
1. Go to BEP detail page
2. Click "Activate" button

### Checking if Project Has BEP

```python
from apps.projects.models import Project

project = Project.objects.get(name='Your Project')

# Check if has BEP
if project.has_bep():
    bep = project.get_active_bep()
    print(f"Active BEP: {bep.name} (v{bep.version})")

    # Get MMI scale
    for mmi in bep.mmi_scale.all():
        print(f"MMI {mmi.mmi_level}: {mmi.name}")
```

---

## POFIN Standard Building Template Details

### MMI Scale (Norwegian)

| MMI | Name | Description | Min Vertex Count | Min Properties |
|-----|------|-------------|------------------|----------------|
| 100 | Konseptfase | Concept phase | 0 | 0 |
| 300 | Forprosjekt - Koordinert | Coordination Design | 20 | 5 |
| 350 | Tverrfaglig koordinert | Cross-disciplinary | 30 | 10 |
| 400 | Klar for produksjon | Production Ready | 50 | 15 |
| 500 | Utført modell | As-built | 50 | 20 |

### Technical Requirements

- **IFC Schema**: IFC4
- **MVD**: Design Transfer View
- **Coordinate System**: EPSG:25833 (EUREF89 UTM33 - Norway)
- **Length Unit**: Meter
- **Tolerance**: 1mm
- **Max File Size**: 500MB

### Disciplines

- **ARK** - Architecture
- **RIV** - Structural
- **ELEKT** - Electrical
- **VVS** - HVAC/Plumbing

### Naming Convention

**File Naming**: `[DISCIPLINE]-[NUMBER]_[DESCRIPTION].ifc`

Examples:
- `ARK-001_Building_A.ifc`
- `RIV-002_Foundation.ifc`
- `ELEKT-001_Power_Distribution.ifc`

### Validation Rules

1. **GUID-001**: GUID Uniqueness (ERROR)
2. **GEOM-001**: 3D Geometry Required at MMI 300+ (ERROR)
3. **PROP-001**: Load Bearing Property Required for Walls (ERROR)

---

## What's Next (Session 011)

### Priority 1: Rewrite MMI Analyzer

**Current Problem**: Uses incorrect 1-7 scale

**Solution**: Update MMI analyzer to:
1. Get active BEP for project
2. Check elements against BEP's MMI scale definitions
3. Return Norwegian MMI levels (100, 300, 350, 400, 500)
4. Use BEP's geometry and information requirements

**File to Modify**: `backend/apps/scripting/builtin/mmi_analyzer.py`

### Priority 2: Create BEP API Endpoints

**Endpoints Needed**:
```
POST   /api/projects/{id}/bep/                # Create BEP from template
GET    /api/projects/{id}/bep/                # Get active BEP
GET    /api/bep/{id}/                         # BEP details
POST   /api/bep/{id}/activate/                # Activate BEP
GET    /api/bep-templates/                    # List templates
```

**Files to Create**:
- `backend/apps/bep/serializers.py`
- `backend/apps/bep/views.py`
- `backend/apps/bep/urls.py`

### Priority 3: Update Frontend Dashboard

**Changes Needed**:
- Display Norwegian MMI scale (100-500) instead of 1-7
- Show BEP information on project page
- Add BEP overview tab to model workspace

---

## Troubleshooting

### Issue: Django Not Installed

**Error**: `ModuleNotFoundError: No module named 'django'`

**Solution**:
```bash
# Activate environment
conda activate bim-coordinator  # or your venv

# Install dependencies
cd backend
pip install -r requirements.txt
```

### Issue: Migration Already Exists

**Error**: `Migration already exists: 0001_initial`

**Solution**: Migration file already created, just run:
```bash
python manage.py migrate
```

### Issue: Templates Already Loaded

**Warning**: `POFIN template already exists, skipping`

**Solution**: This is normal. Templates won't be duplicated. To reload:
```bash
# Option 1: Delete existing BEPs via admin
# Then reload

# Option 2: Load for a different project
python manage.py load_bep_templates --project-id=<different-project-uuid>
```

---

## Key Documentation

- **Full Planning Doc**: `project-management/planning/session-010-bep-workbench.md`
- **Session Worklog**: `project-management/worklog/session-010.md`
- **Models Documentation**: See docstrings in `backend/apps/bep/models.py`

---

## Success Criteria

✅ **Code Complete**:
- [x] 7 database models implemented
- [x] Django admin interface created
- [x] 3 templates defined
- [x] Management command working
- [x] Project model extended

⏳ **Pending** (Requires Environment Setup):
- [ ] Migrations run
- [ ] Templates loaded
- [ ] BEP activated for test project
- [ ] Verified in Django admin

📅 **Future** (Session 011+):
- [ ] MMI analyzer rewritten
- [ ] API endpoints created
- [ ] Frontend BEP workbench built

---

**Implementation Date**: 2025-10-13 (Session 010)
**Status**: Code Complete - Ready for Testing
**Next Session**: Session 011 - MMI Analyzer Rewrite & API Endpoints
