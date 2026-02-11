# Sprucelab vs Magna-Reduzer: Type Mapping Comparison

> **Purpose**: Document the evolution from magna-reduzer scripts to Sprucelab platform
> **magna-reduzer**: `/home/edkjo/skiplum/model-analysis/magna-reduzer/`
> **Sprucelab**: `/home/edkjo/dev/sprucelab/`

---

## Executive Summary

**magna-reduzer** is the prototype: Python scripts that solve the type extraction and LCA export problem for specific projects (G55, S8).

**Sprucelab** is the platform: A full web application that productizes these concepts with a UI, database persistence, cross-project intelligence, and verification workflows.

| Aspect | magna-reduzer | Sprucelab |
|--------|---------------|-----------|
| **Architecture** | Python scripts + JSON files | Django + FastAPI + React + PostgreSQL |
| **Type Storage** | JSON files per project | Database with TypeBank (cross-project) |
| **Material Handling** | Normalization scripts | TypeDefinitionLayer model + UI |
| **Classification** | NS3451 mapper | NS3451 cascading selector UI |
| **Lifecycle Status** | MMI property tracking | `reused_status` field (pending) |
| **Export** | Direct Excel generation | API endpoints + UI |
| **Verification** | Manual review | 4-tier workflow (pending/auto/verified/flagged) |
| **Multi-project** | Separate folders | Single database with TypeBank |

---

## What Sprucelab Inherited

### 1. Types-Only Architecture

**magna-reduzer approach:**
```python
# From analyze_types.py
# Extract types, not individual entities
for type_obj in model.by_type("IfcTypeObject"):
    instances = get_instances_of_type(type_obj)
    type_data = {
        "name": type_obj.Name,
        "instance_count": len(instances),
        "ifc_classes": get_ifc_classes(instances),
        ...
    }
```

**Sprucelab adoption:**
```python
# IFCType model stores the same concept
class IFCType(models.Model):
    type_guid = models.CharField()
    type_name = models.CharField()
    ifc_type = models.CharField()  # IfcWallType, etc.
    instance_count = models.IntegerField()  # Count, not instances
```

**Result**: Both systems extract ~300-500 types per model instead of 50,000 entities.

---

### 2. NS3451 Classification

**magna-reduzer approach:**
```python
# From ns3451_mapper.py
NS3451_MAPPING = {
    "IfcWall": "23",        # Exterior walls
    "IfcSlab": "25",        # Floors
    "IfcColumn": "222",     # Columns
    "IfcBeam": "223",       # Beams
    ...
}
```

**Sprucelab adoption:**
```python
# TypeMapping model with NS3451 field
class TypeMapping(models.Model):
    ifc_type = models.ForeignKey(IFCType)
    ns3451_code = models.CharField()  # "222", "233", etc.
    # Plus: UI cascading selector for 3-digit codes
```

**Enhancement**: Sprucelab adds a UI with cascading selectors (2-digit → 3-digit) instead of manual code entry.

---

### 3. Material Normalization

**magna-reduzer approach:**
```python
# From material_normalizer.py
MATERIAL_CATEGORIES = {
    "steel": ["stål", "steel", "s355", "s235"],
    "concrete": ["betong", "concrete", "b35", "b45"],
    "wood": ["tre", "wood", "timber", "furu", "gran"],
    ...
}

def normalize_material(name: str) -> str:
    # Returns canonical name: "steel", "concrete", etc.
```

**Sprucelab adoption:**
```python
# MaterialLibrary model with Enova categories
class MaterialLibrary(models.Model):
    canonical_name = models.CharField()  # "steel", "concrete"
    enova_category = models.CharField()  # 36 Enova EPD categories
    density = models.FloatField()
    epd_id = models.CharField()  # Reduzer product ID
```

**Enhancement**: Sprucelab adds Enova EPD categories, density data, and direct EPD linking.

---

### 4. Material Layer Composition

**magna-reduzer approach:**
```python
# From type_registry.py
# 6-layer material composition per type
{
    "type_name": "Wall-200mm",
    "layers": [
        {"material": "gypsum", "thickness": 12.5},
        {"material": "steel_stud", "thickness": 70},
        {"material": "mineral_wool", "thickness": 70},
        {"material": "gypsum", "thickness": 12.5}
    ]
}
```

**Sprucelab adoption:**
```python
# TypeDefinitionLayer model
class TypeDefinitionLayer(models.Model):
    type_mapping = models.ForeignKey(TypeMapping)
    layer_order = models.IntegerField()  # 1, 2, 3...
    material_name = models.CharField()
    thickness_mm = models.FloatField()
    ns3457_code = models.CharField()  # Material classification
    material_library = models.ForeignKey(MaterialLibrary)  # Link to EPD
```

**Enhancement**: Sprucelab adds NS3457 material codes and direct MaterialLibrary linking for EPD lookup.

---

### 5. Reduzer Export Format

**magna-reduzer approach:**
```python
# From export_reduzer_mmi.py
REDUZER_COLUMNS = [
    "component_unit",  # m, m², m³, stk
    "component",       # Type name with MMI suffix
    "description",     # Human-readable
    "element",         # NS3451 3-digit code
    "quantity",        # Total quantity
    "unit",            # m, m2, m3, stk
    "productIDType",   # EPDno, NOBB, NEPD
    "productID",       # Product identifier
]
```

**Sprucelab adoption:**
```python
# API endpoint: GET /api/types/export-reduzer/
# Returns Excel with same column structure
# Uses TypeMapping.ns3451_code, TypeDefinitionLayer for materials
```

**Enhancement**: Sprucelab adds UI for export configuration and stores export history.

---

## What magna-reduzer Has That Sprucelab Could Adopt

### 1. MMI (Model Maturity Index) Tracking

**magna-reduzer feature:**
```python
# Tracks lifecycle status per instance
mmi_values = {
    "300": "New",
    "700": "Existing Kept",
    "8xx": "Reused",
    "9xx": "Existing Waste"
}

# Aggregates per type with quantities
type_data["by_mmi"] = {
    "700": {"count": 4432, "quantity": 5812.62},
    "300": {"count": 24, "quantity": 21.38}
}
```

**Sprucelab gap:**
- Has `reused_status` field on MaterialLibrary but not on types
- No per-instance MMI extraction
- No quantity breakdown by lifecycle status

**Recommendation**: Add MMI extraction to FastAPI parser, aggregate in IFCType model.

---

### 2. Multi-Scenario Export

**magna-reduzer feature:**
```python
# Two scenarios per project
# Scenario A: All non-waste → "New" (full new build)
# Scenario C: Actual MMI values (renovation)

export_scenario_a(types)  # G55_ARK_scenarioA.xlsx
export_scenario_c(types)  # G55_ARK_scenarioC.xlsx
```

**Sprucelab gap:**
- Single export, no scenario support
- No "what-if" LCA comparison

**Recommendation**: Add scenario model to support A/B/C comparison in LCA export.

---

### 3. Measurement Rules per IFC Class

**magna-reduzer feature:**
```python
MEASUREMENT_RULES = {
    "count": ["IfcDoor", "IfcWindow", "IfcTerminal"],
    "length": ["IfcPipe", "IfcDuct", "IfcBeam", "IfcColumn"],
    "area": ["IfcSlab", "IfcRoof", "IfcCovering"],
    "volume": ["IfcFooting", "IfcPile"]
}
# Automatically determines unit based on IFC class
```

**Sprucelab current:**
```python
# TypeMapping has representative_unit field
# But requires manual selection per type
```

**Recommendation**: Add auto-detection of measurement unit based on IFC class, with manual override.

---

### 4. Direct Shape Detection

**magna-reduzer feature:**
```python
# Detects Revit "Direct Shape" corruption
# Pattern: "Direct Shape:{ObjectType}:{ElementID}"
# Solution: Flag and use ObjectType instead of TypeObject.Name

if "Direct Shape:" in type_obj.Name:
    is_direct_shape = True
    actual_type = extract_objecttype(element)
```

**Sprucelab gap:**
- No specific handling for Revit Direct Shape exports
- Could cause type explosion in affected models

**Recommendation**: Add Direct Shape detection in FastAPI parser.

---

### 5. Confirmed Reduzer Product IDs

**magna-reduzer feature:**
```python
# 33 confirmed product IDs with exact naming
REDUZER_PRODUCTS = {
    "concrete": "Reduzer Plasstøpt betong - Bransjereferanse B35",
    "steel": "Reduzer Enova Konstruksjonsstål, valseprofil - typisk verdi",
    "gypsum": "Reduzer Enova Gipsplate normal - typisk verdi",
    ...
}
# Note: Some have non-standard spacing, must match exactly
```

**Sprucelab current:**
- MaterialLibrary has `epd_id` field
- But product IDs not pre-populated

**Recommendation**: Seed MaterialLibrary with confirmed Reduzer products.

---

## What Sprucelab Has That magna-reduzer Doesn't

### 1. Cross-Project Type Intelligence (TypeBank)

**Sprucelab feature:**
```python
# TypeBankEntry = Global canonical type
class TypeBankEntry(models.Model):
    ifc_class = models.CharField()
    type_name = models.CharField()
    predefined_type = models.CharField()
    material = models.CharField()
    # Identity tuple prevents duplicates across projects

# TypeBankObservation = Where types appear
class TypeBankObservation(models.Model):
    type_bank_entry = models.ForeignKey(TypeBankEntry)
    ifc_type = models.ForeignKey(IFCType)  # Per-model
    instance_count = models.IntegerField()
```

**Benefit**: Classify once, apply everywhere. See type patterns across projects.

**magna-reduzer gap**: Each project has separate type registry, no cross-project learning.

---

### 2. Verification Workflow

**Sprucelab feature:**
```python
# 4-tier verification status
class TypeBankEntry(models.Model):
    verification_status = models.CharField(choices=[
        ("pending", "Not classified"),
        ("auto", "Auto-classified, needs review"),
        ("verified", "Human verified"),
        ("flagged", "Has issues")
    ])
    verified_at = models.DateTimeField()
    verified_by = models.ForeignKey(User)
    flag_reason = models.TextField()
```

**Benefit**: Audit trail, human-in-the-loop verification, issue tracking.

**magna-reduzer gap**: No verification workflow, assumes all classifications are correct.

---

### 3. Web UI with Keyboard Shortcuts

**Sprucelab feature:**
- TypeLibraryGrid with grouped columns
- Keyboard shortcuts: A=save, F=flag, I=ignore, arrow keys
- 3D type instance preview
- Material layer sandwich editor

**magna-reduzer gap**: CLI only, no interactive UI for classification.

---

### 4. Semantic Type Normalization (PA0802)

**Sprucelab feature:**
```python
# SemanticType model for IFC misuse correction
class SemanticType(models.Model):
    code = models.CharField()  # PA0802 code
    name = models.CharField()  # "Surface Covering"
    description = models.TextField()
    alternative_ifc_classes = models.JSONField()  # Common misuses
    name_patterns = models.JSONField()  # Pattern matching

# Example: IfcSlab used for carpet → EB Surface Covering
```

**Benefit**: Handles real-world IFC modeling mistakes.

**magna-reduzer gap**: Assumes IFC classes are correctly used.

---

### 5. i18n (English + Norwegian)

**Sprucelab feature:**
- All UI text externalized
- `en.json` + `nb.json` locale files
- Language selector in header

**magna-reduzer gap**: Norwegian-only, hardcoded strings.

---

## Migration Path: magna-reduzer → Sprucelab

### For Existing G55/S8 Data

1. **Import types_analysis.json** into Sprucelab
   - Map to IFCType model
   - Create TypeBankEntry for each unique type
   - Create TypeBankObservation for source mapping

2. **Import type_registry.json** classifications
   - Map to TypeMapping model
   - Preserve NS3451 codes
   - Import material layers to TypeDefinitionLayer

3. **Import material normalization**
   - Map to MaterialLibrary with Enova categories
   - Add confirmed Reduzer product IDs

### For New Projects

1. **Upload IFC to Sprucelab** (uses FastAPI parser)
2. **Review types in TypeLibraryPage**
3. **Classify with NS3451 cascading selector**
4. **Add material layers in sandwich editor**
5. **Verify types** (pending → verified)
6. **Export to Reduzer** via API

---

## Summary: Evolution Path

```
magna-reduzer (2024)                 Sprucelab (2025-2026)
─────────────────────────────────────────────────────────────
Python scripts                  →    Django + FastAPI platform
JSON files per project          →    PostgreSQL with TypeBank
Manual NS3451 codes             →    Cascading selector UI
Material normalization          →    MaterialLibrary + Enova EPD
Excel export scripts            →    API endpoints + UI
No verification                 →    4-tier verification workflow
Single project                  →    Cross-project intelligence
CLI only                        →    React web app + 3D viewer
Norwegian only                  →    i18n (EN/NO)
```

**Bottom line**: Sprucelab productizes magna-reduzer's concepts while adding cross-project intelligence, verification workflows, and a modern web UI. The core type-centric philosophy remains the same.

---

## Recommended Enhancements for Sprucelab

Based on this comparison:

1. **Add MMI extraction** to FastAPI parser (high value for renovation projects)
2. **Add measurement rules** per IFC class (auto-detect unit)
3. **Add multi-scenario export** (A/B/C comparison)
4. **Add Direct Shape detection** (Revit artifact handling)
5. **Seed MaterialLibrary** with 33 confirmed Reduzer products
6. **Import G55 type_registry** as initial TypeBank data

---

*Last updated: February 7, 2026*
