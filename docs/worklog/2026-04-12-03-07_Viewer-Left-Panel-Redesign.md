# Session: Viewer Left Panel Redesign — Model Selector + Spatial/Inspect Modes

## Summary
Redesigned the 3D viewer's left panel UX in the wireframe (`03-3d-viewer.html`). Replaced the Solibri-style stacked model tree (all models listed sequentially) with a model dropdown selector + storey list. The key insight: browsing a model's spatial tree and toggling 3D visibility are separate concerns. Also established two view modes: **Spatial** (default, opinionated) and **Inspect IFC** (power user, data-first). Added interactive JavaScript for click-through prototyping.

## Changes
- **`docs/wireframes/03-3d-viewer.html`** — all changes this session:
  - Replaced horizontal model pill bar with dropdown selector (scales to 10-30 models)
  - Added visibility bar (always visible, click discipline dots to toggle 3D on/off)
  - Added view mode toggle: Spatial vs Inspect IFC (documented layout spec for power mode)
  - Fixed orphaned `</div>` bug that broke panel layout
  - Added ~200 lines of JavaScript for interactive prototyping:
    - Model dropdown with full menu (click trigger, pick model, storeys update)
    - Mock data for all 4 models + federated "Alle" view with discipline dots
    - Storey selection updates context bar
    - Tab switching (Typer/System/Material)
    - Visibility bar toggles
    - Toolbar and type toolbar button toggles
    - Section plane selection/deletion with badge count update
    - Pset expand/collapse
    - GUID copy with checkmark feedback

## Technical Details
- **Model dropdown**: Dynamically builds menu on click, each row shows discipline dot + filename + version + count. "Alle modeller (federert)" merges storeys with multi-discipline dot indicators per row.
- **Two view modes** (toggle button top-right):
  - Spatial (default): 280px|1fr|300px — dropdown, vis bar, storey list, context tabs
  - Inspect IFC (power user): 400px|1fr|300px + bottom panel — full 3-level tree, search, element spreadsheet, validation, classification queue. Documented as layout spec in HTML comment.
- **Federated view**: When "Alle" selected, storeys merged across visible models. Each storey row shows colored discipline dots indicating which models contribute elements to that floor.

## Next
- Review wireframe in browser — check dropdown interaction, federated view, overall flow
- Iterate on center canvas and right panel if needed
- Consider building Inspect IFC as separate wireframe (`03b-inspect-ifc.html`)
- When wireframe is settled: update React components (PlatformPanel, FederatedViewer, etc.)

## Notes
- React components from previous session (PlatformPanel.tsx, ViewerToolbar.tsx, CanvasOverlays.tsx, IFCPropertiesPanel.tsx, FederatedViewer.tsx) are premature — need full rewrite once wireframe is approved
- The split-panel pattern (persistent spatial navigator top, contextual tabs bottom) was established in the previous session. This session refined the model selection UX within that framework.
- User's key insight: "the annoying thing about Solibri is seeing the tree from all models one after another" — led to dropdown approach
- "Inspect IFC" naming from user — signals power-user tool for debugging raw IFC structure
