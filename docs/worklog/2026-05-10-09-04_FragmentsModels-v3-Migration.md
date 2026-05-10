# Session: FragmentsModels v3 migration (Phases A → D)

## Summary
Migrated the BIM viewer from the legacy `OBC.FragmentsManager` /
`OBC.Classifier` / `OBC.Hider` / `OBCF.Highlighter` stack to the new
`@thatopen/fragments` v3 `FragmentsModels` API — a worker-based loader
with built-in LOD, off-main-thread culling, and a unified per-model
surface for visibility, highlight, and raycast.

Triggered by yesterday's viewer-quality investigation: bumping the DPR
cap, adding FXAA, swapping the EffectComposer RTs to MSAA samples=4
all delivered "0 visual difference" because the actual bottleneck is
that we ship geometry-only `.frag` (no LOD, no worker, no spatial
structure) and do everything on the main thread. The new pipeline
fixes the architectural issue rather than treating symptoms.

Direct to `main` per trunk-based rule. Six commits across backend +
frontend; one pending verification step (regen on a test model is
in-flight on Railway as of worklog write).

## Commits

| SHA | Phase | What |
|-----|-------|------|
| `a49bee1` | A | `IfcImporter` converter + `Model.fragments_format_version` field + migration 0022 + serializer/views/FastAPI plumbing |
| `6c0e53b` | B | Frontend dual-load: `FragmentsModels` worker instance lazy-init on first v3 model; route by `fragments_format_version` from the `/fragments/` endpoint; `?fragments=v2/v3` URL override; cleanup hooked into existing unmount |
| `d2daa3b` | C1 | Type extraction via `model.getCategories()` + `getItemsOfCategory()` with parallel `getLocalId()` resolution; per-model `setVisible()` for v3 in the existing hider apply effect (TypeInfoEntry now optionally carries `v3Refs`) |
| `d58934a` | C2 | Click selection via `model.raycast({ camera, mouse, dom })` against every loaded v3 model in parallel; closest-hit wins; `model.highlight()` for visual feedback; `getItemsData()` populates the properties panel |
| `23a528c` | D | `python manage.py backfill_v3_fragments` management command — re-runs the new converter on every v2-format model |

`feedback-viewer-perf-rabbithole.md` memory was already written
yesterday; this session deliberately re-opened the lane on the user's
explicit go-ahead and was scoped to a complete migration rather than
piecemeal viewer touches.

## Architecture

```
v2 (legacy, kept alive during dual-load):
  OBC.IfcLoader.load(ifc) → FragmentsGroup (geometry only)
  fragments.export(model)  → v2 .frag binary
  fragments.load(buffer)   → FragmentsGroup
  classifier.byEntity(group), hider.set(false, fragmentIdMap),
  OBCF.Highlighter (raycast), OBCF.Outliner (silhouette)
  MeshCullerRenderer on main thread.

v3 (new, default for new uploads):
  IfcImporter.process({ bytes }) → v3 .frag binary
  new FragmentsModels(workerUrl); fragments.load(buf, { modelId, camera })
  → FragmentsModel { object, useCamera, raycast, setVisible, highlight,
                     getCategories, getItemsOfCategory, getItemsData,
                     getSpatialStructure, getMetadata }
  Worker owns culling + LOD + tile streaming.
  Main thread just adds model.object to scene + calls fragments.update()
  on camera 'rest' event.
```

## Format-version routing

`Model.fragments_format_version` defaults to `'v2'` on every existing
row (migration 0022). The Django callback from FastAPI stamps `'v3'`
when the new converter ran. The frontend reads it off
`GET /api/models/<id>/fragments/` and routes by version.

Federated viewers can mix versions safely — type extraction merges
both kinds into the shared `typeInfo` Map (v2 entries carry
`FragmentIdMap`, v3 entries carry `Array<{ modelId, localIds }>`),
and the visibility apply effect dispatches to the right path per
entry. So a model that gets re-converted while four others stay v2
just works in the same viewer group.

## Hidden wins from the migration

**Spatial structure is built-in.** The PR-A guard from yesterday
(`if (group.hasProperties)`) was sidestepping the missing-properties-
sidecar problem; v3's `model.getSpatialStructure()` runs in the worker
and doesn't need a sidecar at all. PR-B (properties pipeline) is no
longer relevant for v3 models. The legacy v2 path keeps the guard.

**Worker-side culling + LOD.** ThatOpen's `MeshCullerRenderer` we wired
yesterday is replaced by FragmentsModels' built-in worker culling;
`useCamera()` ties each model to the active camera and `update()`
on camera 'rest' triggers re-evaluation. Distant geometry tiles at a
lower LOD instead of pushing the full polycount through the GPU.

**Single binary, no sidecar.** The `.frag` v3 format embeds
attributes, relations, geometry, and spatial hierarchy. We don't ship
a separate properties JSON. Click-to-inspect uses `getItemsData()`
directly.

## Files changed

**Backend**:
- `backend/ifc-service/scripts/convert-to-fragments.mjs` — rewritten
- `backend/ifc-service/scripts/package.json` — dropped
  @thatopen/components, bumped web-ifc to ^0.0.77
- `backend/ifc-service/scripts/package-lock.json` — regenerated
- `backend/ifc-service/api/fragments.py` — `FragmentResult` carries
  `fragments_format_version`; parses it from converter stdout
- `backend/apps/models/models.py` — new `fragments_format_version`
  CharField (max_length=8, default='v2', choices=['v2','v3'])
- `backend/apps/models/migrations/0022_add_fragments_format_version.py`
- `backend/apps/models/serializers.py` — field exposed on
  `ModelSerializer`
- `backend/apps/models/views.py` — `fragments_complete` callback
  writes the version; `GET /fragments/` returns it
- `backend/apps/models/management/commands/backfill_v3_fragments.py`
  — NEW

**Frontend** (single file, six edits):
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`
  - imported `FRAGS` namespace + worker URL via `?url`
  - extended `LoadedModel` type with `formatVersion`,
    `fragmentsGroup?` (v2), `v3Model?` (v3); widened `group` to
    `THREE.Object3D`
  - new `v3FragmentsRef` for the shared `FragmentsModels` instance
  - `ensureV3()` lazy-initialiser + camera-rest hook for `update()`
  - new `finalizeV3Model()` parallel to `finalizeLoadedGroup()`
  - format-version branch in the load loop (with `?fragments=` URL
    override for diagnostics)
  - v3 type extraction (categories + parallel localId resolution)
    merged into the shared `typeInfo` Map alongside v2 entries
  - hider apply effect: per-entry branch on v2 vs v3 visibility ops,
    single `fragments.update()` after v3 ops settle
  - v3 click handler: parallel `raycast()` + closest-hit pick +
    `highlight()` + `getItemsData()` → properties panel
  - v3 worker disposal in unmount cleanup

## Verification

**Local (pre-deploy)**:
- `yarn tsc --noEmit` clean across all six commits
- `yarn build` clean
- `node convert-to-fragments.mjs <small.ifc>` produces a valid v3
  `.frag` (5K elements, 0.1s)
- `node convert-to-fragments.mjs <real-3.4MB.ifc>` produces a 1.25MB
  v3 `.frag` in 10.2s; stdout JSON correctly emits
  `fragments_format_version: 'v3'`

**Deploy**:
- Vercel rolled through six bundle hashes; final live bundle is
  `index-COPCb8fX.js` → ... → (Phase C2 hash)
- Railway: chain-deployed faster than I pushed; multiple inflight
  builds got superseded. The most recent deploy (`23a528c`) is
  still in progress as of worklog write.

**Live verification (PENDING)**:
Triggered fragment regeneration on `G55_RIE` (5,494 elements,
smallest model in the federated viewer at project
`4d9eb7fe-852f-4722-9202-9039bfbfb0d9`, group `08167cc9-...`). The
regeneration is "generating" with the previous in-flight job killed
by Railway pod restarts during the deploy chain. Once Railway settles
on `23a528c`, re-trigger the regen and:
1. Confirm `fragments_format_version: 'v3'` lands on the model
2. Reload the viewer and check the console for the `[Viewer] postpro
   MSAA configured` log + new v3 worker activity
3. Visual: model renders, IFC class chips include the v3 model's
   classes, click on a v3 element selects + populates properties panel
4. Perf: camera move feels noticeably smoother (off-main-thread
   culling + LOD)

## Phase D follow-ups

**Backfill rollout**: Once one model is verified end-to-end,
`python manage.py backfill_v3_fragments` re-converts everything else
in production. Throttled at 2s between trigger calls; safe to re-run.

**Drop the v2 path**: Deferred. The dual-load adds ~150 lines and
behaves correctly; no urgency to delete the OBC-based finalizer. Ping
me to do this once `Model.fragments_format_version` reports v3 across
the board for a sprint.

**Touch-device long-press for right-click exclude**: still parked
(part of the original viewer-perf-rabbithole memory).

**Properties sidecar (PR-B)**: officially obsolete for v3 models. v2
models keep the parked status — no value in pushing PR-B since they're
all going to be regen'd as v3 anyway.

## Memory

Updating `next-steps.md` to reflect post-migration state. The
viewer-perf-rabbithole memory still applies in spirit — the migration
was on explicit user invitation, and future passing comments about
viewer quality should still default to "diagnose, don't volunteer".

## Notes

- Per `feedback-frontend-no-unit-tests.md`: no automated tests added.
  Verification is type-check + build + chrome-devtools live probe +
  the in-flight regen test.
- Per `feedback-trunk-based-until-go-live.md`: every commit shipped
  direct to `main`.
- `?fragments=v2/v3` and `?msaa=N` are now production escape hatches
  alongside the existing `?ao=off`, `?dpr=N`, `?fxaa=off`,
  `?culler=off`. All documented in `deploy-pipeline-gotchas.md`-
  adjacent reference if we need a single page later.
