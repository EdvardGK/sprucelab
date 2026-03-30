# Session: InlineViewer 2D/3D Section-Based Profile View — Planning

## Summary
Debugged the HUD geometry issue (wrong FastAPI port: 8001 vs 8100 in frontend .env.local and dev.sh), then planned a major InlineViewer redesign. The HUD/Model toggle will be replaced with a 2D/3D toggle where 2D uses a clipping-plane section of the actual 3D geometry (find longest axis, clip perpendicular, ortho camera). This approach works universally: walls show cross-section/layers, beams show I/H/C profiles, columns show cross-sections — all from existing geometry data, no new backend endpoints needed.

## Changes
- **Fixed** `frontend/.env.local` — changed `VITE_IFC_SERVICE_URL` from port 8001 to 8100
- **Fixed** `dev.sh` — changed FastAPI port from 8001 to 8100 in 3 places (startup, .env template, docs)
- **Partially modified** `HUDScene.tsx` — added dual camera (ortho/persp) support, but this was done before understanding the full vision. Needs cleanup in next session.
- **Created** plan at `~/.claude/plans/giggly-gliding-bear.md`

## Technical Details
- **Port bug**: Frontend `.env.local` had `VITE_IFC_SERVICE_URL=http://localhost:8001/api/v1` but FastAPI runs on 8100. This caused all HUD geometry fetches to fail with `ERR_CONNECTION_REFUSED`. Backend `.env.local` already had correct port. The `dev.sh` startup script also used 8001.
- **2D section approach**: Instead of SVG diagrams or separate profile extraction, use Three.js clipping planes on the actual mesh geometry. Compute bounding box, find longest axis, place `THREE.Plane` at midpoint perpendicular to it, position orthographic camera looking along that axis. Controls: pan + zoom only.
- **Key user insights**: Beams are always extruded profiles (I, H, C shapes). Walls should show section with layers. Discrete objects (furniture, vents) are 3D-primary. The 3D view should be "gamified" — close up, product showcase feel.
- **HUDScene currently broken**: I modified it to export `ViewDimension` instead of `RenderMode`, but InlineViewer still imports `RenderMode` and passes it as a prop. This needs fixing first thing next session.

## Next
- Execute the plan: rewrite HUDScene with proper section logic, redesign InlineViewer toggle, update overlays
- Layer editor popup for 2D view of layered types
- Test with running servers (FastAPI on 8100)

## Notes
- TypeDefinitionLayer model exists and API works, but data is manual-entry only (not auto-extracted from IFC)
- No IfcProfileDef extraction exists yet — the section approach bypasses this need
- The "See in Model" button stays in InstanceNav but TypeInstanceViewer is no longer a toggle option
- User prefers "close-up gamified" 3D feel, referenced S2 Sannergata geometry work (was Plotly Mesh3d, not Three.js)
