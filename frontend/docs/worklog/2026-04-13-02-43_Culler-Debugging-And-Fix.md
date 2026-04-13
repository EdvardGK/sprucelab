# Session: Viewer Culler Debugging & Fix

## Summary
Continuation of the Phase A performance overhaul from the previous session. The initial Phase A ship made the viewer "incredibly smooth" on Vercel preview but introduced a severe visual regression: all opaque fragment geometry was hidden on initial load, leaving only transparent elements (IfcWindow, IfcCurtainWall) drawn. Debugging took several wrong turns — pixel-size threshold, `matrixAutoUpdate=false` interaction, Vercel build staleness — before the real cause surfaced: the `MeshCullerRenderer` does its first visibility probe at the default camera position (before `fitAllModelsToView` runs), captures "nothing visible" for opaque geometry, and freezes that stale state until the user happens to move the camera. Fix: wire the culler's `needsUpdate` to the camera controls' `rest` event so it re-probes every time the camera stops moving, plus force one immediate re-probe right after fit-to-view completes. Model now renders correctly AND stays smooth. Also fixed an unrelated context menu bug (right-drag-to-pan was opening the menu on every pan).

## Changes

### `UnifiedBIMViewer.tsx`
- **Culler re-probe on camera rest**: after `cullers.create(world)` in `initViewer`, added a `controls.addEventListener('rest', ...)` that sets `culler.needsUpdate = true` whenever the camera stops moving. Covers all post-init state changes (fit-to-view, user pan, user zoom, user orbit, section plane moves).
- **Forced culler re-probe after load**: in the `loadModels` effect, after `fitAllModelsToView()` runs, explicitly set `cullerRef.current.needsUpdate = true` as belt-and-suspenders. The `rest` event listener already handles it, but an immediate force at this specific moment avoids a one-tick window where opaque geometry is invisible.
- **A2 (matrixAutoUpdate=false) removed**: originally suspected as the cause of the ghosting (theory was that freezing matrices broke the culler's internal probe). Spent a push disabling it via `?static-matrix=off` kill switch, then made the removal permanent. Turned out not to be the cause — the real bug was the probe timing. Left A2 removed anyway since it's a trivially minor perf tweak not worth re-adding.
- **Culler threshold 5px**: initially set to 80 in the original Phase A push, assuming that was moderate. User reported "ghosted and incomplete" small BIM elements. Dropped to 5 so only truly sub-pixel geometry gets size-culled. The real perf win of the culler is frustum culling (geometry outside the camera view is skipped); pixel-size threshold is bonus.
- **Right-click drag-vs-click detection**: existing context menu was using the native `contextmenu` event which fires on right-button *mousedown* — same moment where ThatOpen's camera controls start right-drag-pan. Every pan opened the menu. Replaced with explicit mousedown/mouseup tracking using the existing `CLICK_THRESHOLD_PX=5` and `CLICK_THRESHOLD_MS=250` constants. Native `contextmenu` event is now suppressed via `preventDefault` only. Outside-click dismiss already existed in `ViewerContextMenu.tsx:54-80`; it stopped mis-firing once the menu wasn't constantly being re-opened by drags.
- **Diagnostic kill switches via URL query params**:
  - `?culler=off` — disables `MeshCullerRenderer` entirely at init
  - `?static-matrix=off` — skips the matrixAutoUpdate freeze (now no-op since A2 was removed, but flag still present)
  - Left in place as permanent debug escape hatches. Harmless at runtime, invaluable for bisection.

## Technical Details

### The ghost-debugging path (what didn't work)
1. **First theory: pixel-size threshold too aggressive.** Dropped from 80 to 5. User: "same issue." This revealed Vercel hadn't rebuilt — bundle hash was still `BCbo1VCa`. Chased a separate Vercel deploy-pipeline rabbit hole.
2. **Second theory: `matrixAutoUpdate = false` broke the culler's internal probe.** Added `?static-matrix=off` kill switch. User tested, same ghosting → theory wrong.
3. **Third theory: the probe captures visibility at the default `(50, 50, 50)` camera position before `fitAllModelsToView()` runs.** This is the camera bootstrap sequence:
   - `initViewer` creates world + camera at `(50, 50, 50)` looking at origin
   - Culler is created, starts monitoring
   - Models load in parallel, each registered with `culler.add(fragment.mesh)`
   - First culler probe fires at some point during this process — likely before model bboxes are computed
   - `fitAllModelsToView()` runs AFTER all loads, moving the camera to frame the actual models
   - But the culler's stale "nothing opaque visible" state persists because it only re-probes on interval
4. **Why transparent elements survived**: `MeshCullerRenderer.add()` has a short-circuit that `return`s immediately if all materials on a mesh are transparent — those meshes are never registered with the culler, so its state can't hide them. Windows and curtain walls are mostly-transparent glass → unaffected. Everything else was opaque → culler-controlled → hidden by the stale state.

### Why the fix works
`needsUpdate = true` forces the culler to re-run its probe on the next tick from the CURRENT camera position. After `fitAllModelsToView()` completes, the camera is framing the models — a probe from that position correctly sees all opaque color codes, and the visibility map updates. The `rest` event listener ensures this continues to work for every subsequent camera movement (user pan, zoom, orbit, new section plane) without needing explicit triggers.

### Context menu bug
Symptom: the right-click context menu appeared on every right-drag-to-pan, and sometimes wouldn't dismiss. Root cause: `contextmenu` DOM event fires on right-button *mousedown*, which is also when ThatOpen's camera controls start pan-drag. So every drag opened the menu before you even knew you were dragging. Fix: same drag-vs-click detection pattern already used for left-click selection — track right mousedown position/time, on mouseup check distance (5px) and elapsed (250ms), only open menu on a clean click. Native `contextmenu` event is still handled but only to `preventDefault()` the browser's default menu. The outside-click dismiss logic in `ViewerContextMenu.tsx` already worked; it was being masked by constant reopening.

### Residual rAF violations
After the fix, the console still shows ~15 rAF violations and some setInterval violations per minute of interaction. Character is different from pre-Phase-A: these are short, discrete spikes during camera rest events (culler re-probe rendering its internal 512×512 scene) and React state cascades, not sustained every-frame blocking. Not investigated further this session — user accepted the state and moved on. Easy follow-up tweaks documented: increase `updateInterval` from 1000 to 2500-3000 ms, drop probe resolution to 256×256.

## Next

1. **Decide on residual rAF violations** — if worth fixing, quick tweak to `culler.config.width/height/updateInterval`. Lower probe resolution and slower tick means fewer blocking frames at zero visual cost.
2. **Phase B (Reliability)** per `~/.claude/plans/federated-tinkering-riddle.md`:
   - B1: delete IFC fallback entirely in the viewer, replace with fragment polling UI
   - B2: eager fragment generation on upload
   - B3: speed up `convert-to-fragments.mjs` — persistent Node worker, pipelined phases, `UV_THREADPOOL_SIZE=8`
   - B4: retry + reconciliation for fragment generation
   - B5: IndexedDB browser cache for fragments
3. **Phase C (Data-driven viewing ops)** — color coding, stacked filters, isolation, rule-based selection. Can run parallel to B.

## Notes
- The single biggest time sink this session was Vercel preview bundle caching. User reported symptoms multiple times, but the bundle hash was `BCbo1VCa` both before and after pushes. A manual redeploy eventually produced a new hash, but the dashboard showed "2h old" for a long time. For future debugging sessions: **always verify the bundle filename changed before interpreting "same issue" results** — or test against localhost Vite.
- `MeshCullerRenderer._transparentMat` (opacity 0) and its short-circuit for transparent-only materials was a critical forensic clue: the user's "only windows and curtain walls visible" symptom exactly matched "everything with opaque materials was culler-controlled, everything fully transparent was not."
- Culler docs (ThatOpen tutorial) mention: "the culler is updated each time the camera stops moving, which generally works well for most apps." We needed to wire this explicitly — it wasn't automatic out of the box. This is the kind of ThatOpen canonical pattern that's documented in tutorials but not in the class's JSDoc.
- The URL query param kill switches were genuinely invaluable for isolating the bug. Kept them in place as permanent debug hooks.
- Gemini's screenshot analysis was confidently wrong about ThatOpen having auto-X-ray-on-selection mode (it does not). But its observation "looks transparent" was correct and useful — that pushed me to check material transparency, which led to the `_transparentMat` finding and the correct diagnosis.
