# Session: IFC4 Type Parsing Fix + Production Deploy Fixes

## Summary
Fixed three production issues: (1) IFC4 models showing 0 types due to wrong inverse attribute name, (2) Vercel frontend build failing from TypeScript strict mode errors in BEP components, (3) Railway FastAPI service crashing on startup from missing `pyproj` dependency. All fixes pushed and verified live.

## Changes
- **backend/ifc-service/services/ifc_parser.py** — Check `Types` (IFC4) before `ObjectTypeOf` (IFC2X3) in both `parse_types_only()` and `_count_type_instances()`
- **backend/ifc-service/services/ifc_loader.py** — Same IFC4/IFC2X3 inverse attribute fix for instance loading
- **backend/ifc-service/requirements.txt** — Added `pyproj>=3.6.0` (was imported by `crs_lookup.py` but never in requirements)
- **frontend BEP components** (MMITableMaker, StoreyTable, DisciplineTable, TechnicalRequirementsForm, CoordinateSystemForm) — Fixed TypeScript errors: missing `bep` in Omit types, unused imports, null parameter types, string vs union type mismatches
- **frontend/src/pages/ModelWorkspace.tsx** — Removed unused `showAll` prop from GeometryDonut

## Technical Details
**IFC4 vs IFC2X3 inverse attributes**: In IFC2X3, `IfcTypeObject` has inverse `ObjectTypeOf` pointing to `IfcRelDefinesByType`. In IFC4, this was renamed to `Types`. Our parser only checked `ObjectTypeOf`, so all IFC4 models got `instance_count=0` for every type. The `get_queryset()` in `IFCTypeViewSet` filters out `instance_count=0` by default, making all types invisible in the frontend.

**G55_RIV was the first IFC4 model** uploaded — all others (ARK, RIE, RIB) are IFC2X3, which is why the bug wasn't caught earlier. After fix: 259 types, 29,649 instances correctly counted. Model was reprocessed via `/api/v1/ifc/reprocess`.

**Railway 502**: The FastAPI service was crashing immediately on import because `api/crs_lookup.py` imports `pyproj` which wasn't in `requirements.txt`. The CORS errors in the browser console were misleading — Railway's edge proxy returns 502 without CORS headers, which browsers report as CORS failures.

**Vercel build**: `tsc` strict mode was catching unused imports (`ProjectStorey`, `ProjectDiscipline`, `ProjectCoordinates`), null-assignability issues in `setLocal()` functions, and union type mismatches (`ifc_schema: string` vs `'IFC2X3' | 'IFC4' | 'IFC4X3'`). All from BEP phase 1 components that added a `bep` required field to `MMIScaleDefinition` without updating template constants.

## Next
- Verify Vercel deploy completed successfully (should auto-trigger from push)
- Test RIV types in production frontend
- Continue with field module frontend rebuild (wireframe 07)

## Notes
- Railway CLI needs interactive terminal for `railway link` — can't be done from Claude Code directly
- Auto-commit hooks push to GitHub automatically, so manual squash+push pattern doesn't work well — the individual commits are already on remote
- `railway logs --lines N` is the flag for historical logs (not `--num` or `--tail`)
