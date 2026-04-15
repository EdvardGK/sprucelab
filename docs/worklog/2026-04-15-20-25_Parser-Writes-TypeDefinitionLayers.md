# Parser writes TypeDefinitionLayer from real IFC material data

**Session date:** 2026-04-15 (late afternoon)
**Branch:** dev
**Owner:** Edvard + Claude (Opus 4.6 1M)
**Mood:** All recipes become real

## What shipped

Task #18 from the Feast session. The FastAPI parser now extracts the full material layer stack from IFC files and writes `TypeMapping` + `TypeDefinitionLayer` rows with the same schema the seed command uses, tagged `notes='__parsed__'`. Reprocessing a model replaces the synthetic seed data with the architect's actual material specification.

Five code changes:

1. `TypeLayerData` dataclass + `TypeData.definition_layers` (`backend/ifc-service/repositories/ifc_repository.py`)
2. `_extract_type_layers` + `_infer_representative_unit` + `_find_material_association` (`backend/ifc-service/services/ifc_parser.py`)
3. Wired into both parse paths: the production `parse_types_only` (iterates `IfcTypeObject`, falls back to a representative element from `ObjectTypeOf`/`Types` inverse rels) and the legacy `parse_file`→`_extract_types` (ObjectType grouping path with first-element fallback)
4. `bulk_insert_type_definition_layers` repo method — raw asyncpg, upserts mapping via `ON CONFLICT (ifc_type_id) DO UPDATE ... RETURNING (xmax=0)`, clears existing `__parsed__` layers, bulk-inserts fresh
5. Wired into both orchestrator paths: `process_model` (step 4c) and `process_model_types_only` (step 3b). `delete_model_data` also extended with explicit `type_definition_layers` + `type_mappings` DELETEs so the clean-up is self-documenting instead of relying on implicit FK CASCADE.

## Why this matters

Before: Materials Browser, Balance Sheet, passports, LCA export — all operated on either empty data (no manual classification) or the 3033 synthetic seed rows from the Feast session. Users had to classify everything by hand or the platform just shipped fake data.

After: Every model reprocess auto-populates real layers with real material names, real thicknesses, and real m³/m² recipes pulled directly out of the architect's Revit export. Zero human labour. Downstream features all get real signal for free.

## Two surprise bugs caught in testing

### Bug 1: two parse paths, only one production

Initial implementation patched `_extract_types` which is used by `parse_file()`. Dry-run against `A4_RIB_B.ifc` returned 3 types. But the DB had 86 for that model. The parser has two entry points:

- `parse_file` → `_extract_types` — groups by element `ObjectType` attribute. 3 types. **Legacy, not used in production.**
- `parse_types_only` — iterates `ifc_file.by_type('IfcTypeObject')` directly. 86 types. **Production, 0.20s parse.**

The orchestrator uses `parse_types_only` via `process_model_types_only`. This matches CLAUDE.md's "2-sec parse, 100-500 types" description of Session 031's architecture. If I had only patched `_extract_types` and tested via FastAPI, the code would have silently done nothing on production models.

Fix: patched both. `parse_types_only` uses the IfcTypeObject's inverse `ObjectTypeOf`/`Types` rel to find a representative element and falls back to that element's `HasAssociations` when the type itself has no material association — which is the common case in Revit exports.

### Bug 2: length unit scale

First end-to-end run wrote `thickness_mm=320000` for a 320mm concrete slab. The file declares length unit as millimeters (`IfcSIUnit(LengthUnit, MILLI, METRE)`, scale 0.001) but my code treated `IfcMaterialLayer.LayerThickness` as meters and multiplied by 1000.

Fix: compute `ifcopenshell.util.unit.calculate_unit_scale(ifc_file)` once per file open, thread `length_unit_scale` through `parse_types_only` → `_extract_type_layers` (also `parse_file` → `_extract_types` for symmetry). Apply to raw `LayerThickness` before converting to mm or using as m³/m² quantity.

After fix: the same slab writes `thickness_mm=320.0 qty=0.32 m³`. Verified against G55 type names which encode thickness in the string — e.g. `'Basic Wall:Vegg Betong, T=250, B30'` → `thickness_mm=250.0` — the name literally tells you what the value should be.

## Test results

### Test model (20251224_project_test / A4_RIB_B, IFC2X3, 3.3MB, 86 types)

**Before:** 86 types, 0 mappings, 0 layers
**After:** 86 types, 86 mappings, 86 layers (all `notes='__parsed__'`)

Representative units: 48 m (beams/columns), 38 m² (slabs/walls).

Spot checks:

```
IfcSlabType '320*1928' → CONCRETE/B45 thickness_mm=320.0  qty=0.32 m³
IfcSlabType '200*3450' → CONCRETE/B35 thickness_mm=200.0  qty=0.20 m³
IfcBeamType 'HEA340'   → STEEL/S355J2   thickness_mm=None  qty=1.0 m
IfcBeamType 'CFRHS120*60*4' → STEEL/S355J2 thickness_mm=None qty=1.0 m
```

Type names encode the expected thickness — perfect match.

### G55_RIB_Prefab dry-run (309 types)

Parsed in 0.16s. **309/309 types got layers.**

```
IfcWallType 'Basic Wall:Vegg Betong, T=250, B30' → Betong Prefabrikert thickness_mm=250.0 qty=0.25 m³
IfcWallType 'Basic Wall:Betong, eksist. T=200'   → Betong Prefabrikert thickness_mm=200.0 qty=0.20 m³
IfcSlabType 'Floor:Prefabdekke 265'              → Betong Prefabrikert thickness_mm=265.0 qty=0.265 m³
```

Reprocess running in background as of this writing — not verified in DB yet. Pipeline is proven by the earlier test model run; G55_RIB_Prefab is just the same code executing against more types.

### G55_ARK dry-run (4815 types, 157 MB, architectural)

Parsed in **9.5s** (well below the hand-wavy "minutes" I feared for a 157MB file).

**4803/4815 types extracted with layers** (99.75%). 12 types had no material association, zero errors, zero exceptions.

**158 types have multiple layers** — real sandwich walls:

- `'Basic Roof:Stål Isolert - 500mm'` → 3 layers summing to 5+50+445 = 500mm exactly. The name doesn't lie.
- `'Basic Wall:IV-ST-01'` → 5 layers: 13mm Habito gypsum / 12.5mm gypsum / 100mm steel stud with 70mm mineral wool / 12.5mm gypsum / 13mm Habito gypsum. Norwegian material-library naming preserved as-is (`ALAB_24x_INNERVEGGER_Stenderprofiler_Stål_100 mm_Stålstender med min. 070 mm mineralull`).
- `'Basic Wall:KL-1002 Murstein'` → 3 layers: 120mm brick fasade + 15mm unnamed + 60mm air cavity.
- `'Basic Wall:Yttervegger Betong 750'` → single 750mm concrete slab, name matches data.

**G55_ARK has NOT been reprocessed in this session** — the DB roundtrip rate against Supabase makes it slow enough to need a dedicated run. The dry-run proves the code works on this data; the payload is just the orchestrator's per-type DB work. Queued for the next session, or for a background reprocess while other work happens.

## Idempotency + reprocess semantics

`TypeMapping.ifc_type` is `OneToOneField(CASCADE)`, so deleting an `IFCType` row cascades through `TypeMapping` → `TypeDefinitionLayer` at the DB level. `delete_model_data` runs before each reprocess and now explicitly deletes both tables for clarity.

The `notes='__parsed__'` tag is not required for clean reprocess, but `bulk_insert_type_definition_layers` still clears only `__parsed__` rows for an upserted mapping before bulk-inserting new ones. Rationale: if anyone ever writes a "backfill layers without reprocessing" path (which might be the right move for G55_ARK), the tag lets it safely wipe and regenerate parser output without touching `__claude_seed__` rows or user-entered layers.

Three layer-source tiers intentionally coexist:

| Tag | Source | Survives reprocess |
|---|---|---|
| `__parsed__` | FastAPI parser | recreated each reprocess |
| `__claude_seed__` | `seed_type_definition_layers` | wiped by reprocess (no CASCADE protection yet) |
| `None` / user text | UI or Excel (future) | wiped by reprocess (no protection yet) |

The lack of user-layer preservation across reprocess is a known gap. Once a UI path exists for manually entering layers, we'll need to either (a) not delete user layers in `delete_model_data`, or (b) store them separately. Not urgent because no such UI exists yet.

## Files changed

**Modified:**
- `backend/ifc-service/repositories/ifc_repository.py` — `TypeLayerData`, extended `TypeData`, `bulk_insert_type_definition_layers`, `delete_model_data` extended with explicit deletes
- `backend/ifc-service/services/ifc_parser.py` — `_extract_type_layers`, `_infer_representative_unit`, `_find_material_association`, `_TYPE_UNIT_MAP`; wired into both `parse_types_only` and `_extract_types`; `parse_types_only` captures `representative_element` via inverse rels
- `backend/ifc-service/services/processing_orchestrator.py` — added layer-insert step to both `process_model` (step 4c) and `process_model_types_only` (step 3b)

## Known gaps / next moves

1. **Reprocess G55_ARK and G55_RIV** — the payload models. Code is proven by dry-run; just needs the DB roundtrips to complete. Budget maybe 30-60 minutes each against Supabase pooler.
2. **Backfill path** — write a Django management command or FastAPI endpoint that parses an already-loaded model and writes layers only, skipping `delete_model_data`. Would let us backfill all existing models without reprocessing everything. Would also preserve `__claude_seed__` rows for mappings that the parser doesn't produce layers for.
3. **Seed command and parser overlap** — with the parser writing real data, the seed command is now a dev-only tool for populating types the parser can't handle. Consider removing it, or repurposing it for demo data in empty projects.
4. **Orchestrator speed** — the 188s reprocess for an 86-type model is mostly N+1 DB queries in TypeBank linking, instance-count updating, and the new layer writer. At Supabase pool latency, this becomes minutes per hundred types. Batchable in several places — deferred until it actually hurts (probably when backfilling G55_ARK).
5. **`<Unnamed>` materials in G55_ARK** — some `IfcMaterial.Name` is literally the string `<Unnamed>` in the file, which is valid IFC and gets preserved as-is. Not a bug. If it bothers the Materials Browser UI we can normalize downstream.
6. **Materials Browser verification** — next session should open the browser against the reprocessed G55_RIB_Prefab and confirm the layers show up correctly. Playwright e2e would be the right place.

## Honest notes

- The G55_RIB_Prefab reprocess kicked off during the worklog write and hadn't finished when this file was saved. The dry-run evidence is strong, but the "G55 verified end-to-end in DB" claim isn't true for ARK yet.
- The unit-scale bug would have shipped broken if I hadn't spot-checked `thickness_mm=320000` in the DB. Lesson: always read a concrete value from the DB after a write, don't trust the parser's intermediate output alone.
- The two-path issue (`parse_types_only` vs `parse_file`) is a reminder that CLAUDE.md is the authoritative source for "which code is actually hot" — it clearly says "types-only, 2-sec parse", which should have told me to look for a path that doesn't iterate elements. I should have read it before guessing.
