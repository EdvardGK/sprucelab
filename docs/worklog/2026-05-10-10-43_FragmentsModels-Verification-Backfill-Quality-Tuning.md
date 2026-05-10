# Session: FragmentsModels v3 — verification, backfill, post-deploy bug fixes, quality tuning

## Summary
Continuation of the FragmentsModels v3 migration shipped earlier today
(see `2026-05-10-09-04_FragmentsModels-v3-Migration.md` for the full
architecture). This block was the verification + drive-to-green arc:
ran the backfill, surfaced and fixed five real production bugs that
the migration unmasked, and started tuning runtime quality. End state:
all 5 G55 federated models live as v3 (~395MB → ~47MB), viewer
renders cleanly. Quality knobs (graphicsQuality, MSAA, DPR) are now
tunable via URL flags but the LOD-driven snappiness win is blocked on
an upstream ThatOpen bug.

## Changes (post-09:22)

### Bugs surfaced + fixed during verification
- **`463abf3`** — `fragments-complete` callback was rejecting
  FastAPI's `X-API-Key`-headered POST with 403 because it had no
  `permission_classes=[AllowAny]` (the sibling `process-complete`
  has it). Discovered via Railway logs the user shared:
  `Warning: Django callback failed with status 403`. The new
  converter had been working — producing v3 binaries in 6.5s — but
  Django was throwing them away. This was almost certainly always
  broken (G55_RIE last "completed" 2026-04-12, before the
  `fragments_format_version` field even existed); the migration
  surfaced it.
- **`dad5bc9`** — Frontend now routes by **binary signature sniff**
  (zlib magic `0x78 0x9c` = v3, otherwise v2), not the DB stamp. Two
  reasons: (1) when 463abf3 was missing, the binary in storage was
  v3 but the DB stamp said v2 → would have broken loading; (2)
  removed the silent IFC-fallback when fragments existed because the
  partial v2 fragments.load was poisoning web-ifc state, surfacing
  as misleading `SetWasmPath null` errors.
- **`de5bdfb`** — `fitAllModelsToView` now uses `v3Model.box`
  (worker-computed AABB) for v3 entries instead of
  `Box3.setFromObject`, which was empty until tiles streamed.
  Symptom: empty canvas after backfill.
- **`5198014`** — Wired `fragments.update()` to camera-controls
  `update` event (continuous, not just `rest`) + explicit kick
  after each v3 model load + made `fitAllModelsToView` async to
  await `getMergedBox(undefined)`. Without these, on initial mount
  the camera doesn't move so 'rest' never fires, the worker stays
  idle, no tiles stream, canvas stays empty.

### Backfill
Triggered v3 regen on all 5 G55 models via
`POST /api/models/<id>/generate_fragments/?force=true`. Final sizes:
- G55_RIB_Prefab: 0.35 MB v3
- G55_RIBprefab: 12.86 → 4.01 MB (3.2×)
- G55_ARK: 94.14 → 16.61 MB (5.7×)
- G55_RIE: 16.62 → 2.72 MB (6.1×)
- G55_RIV: **271.3 → 23.54 MB (11.5×)**
- **Total: 395 MB → 47 MB (8.4× compression)**

`backfill_v3_fragments` management command exists (commit `23a528c`)
but couldn't be run remotely without Railway shell access; the per-
model API approach worked fine for 5 models.

### Quality tuning (incomplete)
- **`5b4f737`** — Set `graphicsQuality = 0.5` to actually engage
  v3's LOD system (was 1.0 = full detail = no LOD savings = no
  visible perf win over v2). Removed the postpro MSAA diagnostic
  console.info from `53d7e1a`.
- **`9806009`** — **Reverted graphicsQuality to 1**. With 0.5,
  @thatopen/fragments@3.0.11 throws
  `Cannot read properties of undefined (reading 'lodSize')` on
  every rAF tick: `tile.lodSize` is read in BIMMesh.onBeforeRender
  before the worker has assigned the tile a LOD bucket. Upstream
  bug. Same commit also flipped `?dpr=N` from a CAP to an exact
  pixel-ratio override so DPR=1 users can opt into supersampling
  (e.g., `?dpr=1.5` renders at 2.25× then downsamples → SSAA).

## Technical details — why "felt better, then fell away"

The user reported the v3 viewer felt snappier and crisper for a few
seconds after fit-to-view, then degraded. That's not perception bias:

1. **Initial frames**: worker has streamed only the closest / coarsest
   tiles → small render workload → snappy.
2. **After ~5s**: with `graphicsQuality = 1`, the worker streams every
   remaining tile at full detail. By steady state, every visible
   surface is rendered at full polycount.
3. **Steady-state per-frame cost ≈ v2** because v2 also renders
   everything on the main thread. v3 wins now come only during
   camera motion (off-thread culling) and on initial load (smaller
   binaries).

The big v3 perf story (LOD-simplified distant geometry) requires
`graphicsQuality < 1`, which is currently blocked on the lodSize bug.

## URL escape hatches (current state)

| Flag | Effect | Default |
|------|--------|---------|
| `?gq=N` | graphicsQuality (0=low LOD, 1=full detail) | 1 |
| `?msaa=N` | MSAA samples on composer RTs | 4 |
| `?ao=off` | Disable SSAO postpro pass | on |
| `?dpr=N` | **Exact** pixel ratio (DPR=1 + ?dpr=2 → SSAA) | clamp to [0.5, 2] |
| `?fragments=v2/v3` | Force load path | sniff binary |
| `?fxaa=off` | (no-op now — FXAA was removed) | — |
| `?culler=off` | Disable v2 MeshCullerRenderer | on |
| `?force=true` | (POST flag) bypass `generating` lock on regen | off |

## Files touched (this block)

- `backend/apps/models/views.py` — `fragments_complete` AllowAny;
  `generate_fragments` accepts `?force=true`
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` —
  binary sniff routing, no IFC-fallback when fragments existed,
  fitToView uses v3Model.box, fragments.update on 'update' event,
  graphicsQuality tunable via ?gq, ?dpr= as exact ratio, dropped
  the diagnostic log

## Next

- **Watch ThatOpen for a fix on the lodSize crash** (graphicsQuality
  < 1). Once that lands and we can `yarn upgrade @thatopen/fragments`,
  default graphicsQuality back to 0.7 — that's where the actual
  user-perceptible v3 perf win lives.
- **PR 1.3 — `<DrillTarget>` + interactive `CanvasStatusPanel` chips
  + DrillModal demote** (the planned next phase of the frontend
  refresh). All viewer-side migration work is complete; the user can
  return to feature work.
- The `?dpr=1.5&ao=off` combo is the recommended quick-win for users
  reporting "not crisp / not snappy" on DPR=1 displays until LOD is
  unlocked.

## Notes

- **Trunk-based**: every commit (16 total today across both blocks)
  pushed direct to `main`. No PRs.
- The `feedback-viewer-perf-rabbithole.md` memory still applies —
  this block was scoped, user-explicit migration work; future
  passing comments about viewer quality should still default to
  "diagnose, don't volunteer".
- Plausible analytics CORS error in production console is unrelated
  to anything we shipped — `frontend/index.html:9` references a
  Plausible script whose dashboard config doesn't include
  `www.sprucelab.io`. Dashboard fix, not code.
