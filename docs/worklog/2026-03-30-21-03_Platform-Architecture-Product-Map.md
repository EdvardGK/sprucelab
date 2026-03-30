# Session: Platform Architecture Product Map + HUD Debugging

## Summary
Major product architecture session. Created a comprehensive product map (`docs/knowledge/platform-architecture-product-map.md`) that defines Sprucelab's positioning: IFC as Layer 1, integrated vertical workflows (BIM-centric and operational), and a Documentation Module as the connective tissue. Established 4 core principles. Also started debugging the InlineViewer HUD — identified that FastAPI wasn't running and Django had wrong port config, fixed both. Geometry endpoint works but HUD still shows "No geometry available" — needs further debugging.

## Changes
- **Created** `docs/knowledge/platform-architecture-product-map.md` — full platform product map with:
  - 4 core principles: spatial workflows, Layer 1 quality gates, documentation traceability (not correctness), work layer vs shared layer (data ownership)
  - Role mapping: design team, BIM-centric verticals, operational verticals, external verification
  - Every vertical has Read/Contribute/Document relationship with the model
  - Work layer (private, project-agnostic) vs shared layer (project containers, ownership transfers on publish)
  - Three entities: user workspace, company/org, project — each with different lifecycles
  - Product roadmap implications
- **Modified** `backend/.env.local` — added `IFC_SERVICE_URL=http://localhost:8100`
- **Modified** `frontend/src/components/features/viewer/InlineViewer.tsx` — added debug logging for data flow

## Technical Details
- FastAPI IFC service was not running — instances endpoint was 500ing because Django defaulted to port 8001 instead of 8100
- Fixed port in `.env.local`, started all 3 servers (Django 8000, Vite 5173, FastAPI 8100)
- Instances endpoint now works (200), geometry endpoint returns valid data via curl
- Tested type geometry extraction with ifcopenshell: `create_shape` on type objects FAILS even with RepresentationMaps (ifcopenshell 0.8.4 limitation). First instance with `USE_WORLD_COORDS=False` works as canonical type geometry fallback.
- G55_ARK file has 4929/5684 types with RepresentationMaps (ArchiCAD export). A4_RIB has 0/86 (Revit export). Confirms Revit doesn't use RepresentationMaps.
- HUD shows "No geometry available" despite backend working — geometry fetch completes but returns null. Likely the geometry extraction fails for certain element types, or there's a mismatch between the GUID being sent and what FastAPI can tessellate.
- Conda env for FastAPI is `sprucelab` (not `ifc`).

## Next
- Debug why HUD geometry returns null (check browser console for `[InlineViewer]` debug log)
- Consider adding a "type geometry" endpoint that uses first instance + local coords as canonical form
- Add RepresentationMap quality check to verification engine
- Add IfcOpenShell (LGPL-3.0) and ThatOpen (Apache-2.0) attribution to the app
- Continue with B3: Dashboard Enhancement after viewer is working

## Notes
- Key product insight: work layer is project-agnostic (your workspace), shared layer is a project container. Publishing = ownership transfer. This creates the adoption flywheel: companies move internal workflows in, sharing into projects becomes trivial.
- RepresentationMap usage is a measurable IFC quality metric — should be a verification rule
- User wants IfcOpenShell and ThatOpen properly attributed per their licenses
