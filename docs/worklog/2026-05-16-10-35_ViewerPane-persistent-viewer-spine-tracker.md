# Session: ViewerPane block, persistent Type-page viewer, spine reframe, canonical dev tracker

## Summary
Shipped the reusable `ViewerPane` shell and made the Type page's viewer mount once per modelId with isolation prop driving state (no more remount-on-filter-click, ending the "Viewer world unmounted before v3 fragments load began" race). Audited accumulated complexity, then reframed the framing itself: replaced "cut vs keep" with **deprecate or develop** after the user pushed back twice on reflexive-cut suggestions. Established `docs/dev.md` as the canonical project tracker after a short-lived `/dev` webapp page was scrapped in favor of a single markdown file; CLAUDE.md and memory both point at it now. Key conceptual move: Claims / Annotations / Issues are **three distinct primitives** in the proposal-and-routing spine, not one; source is sacred (export-as-pset always forks).

## Changes

### `ViewerPane` block + persistent Type-page viewer (commit `8434672`)
- `frontend/src/components/features/viewer/ViewerPane.tsx` — new generic shell (header + canvas slot + rail slot in right/left/bottom orientation). Predictable API across dashboards.
- `frontend/src/components/features/warehouse-v2/TypeViewerPaneV2.tsx` — refactored to compose `ViewerPane`; then full rewrite to mount `UnifiedBIMViewer` once per modelId with `isolation` derived from `selectedType` (via `useTypeInstances`, limit 100000) and `activeIfcClass` (via `useTypesInstancesByClass`). HUD-based InlineViewer path retired from this surface; lives on in TypeMapping/Library/Material.
- `frontend/src/pages/ModelWorkspace.tsx` — inline viewer tile + fullscreen overlay both swap onto `ViewerPane`; `AnalysisDetailsRail` always-mounted in the rail slot (no layout reflow on type pick). Parent grid restored to `flex` so DashboardTile resolves `h-full` against a definite parent height.
- i18n: added `modelDash.viewer.{title,show3d,showFootprint,fullscreen}` (en + nb).

### Canonical project tracker (commits `02cf237`, `1919bf6`, `5633c92`)
- Built `/dev` as a React page first (`02cf237`); then dropped it in favor of `docs/dev.md` after the user noted that a markdown file in the repo is simpler — sessions/agents read the filesystem, no API, no build cycle.
- `CLAUDE.md` prepended with pointer to `docs/dev.md`.
- Memory entry `dev-md-canonical-tracker.md` added so every future session knows to read it first.

### Chore batch from prior session (commit `bcc973f`)
- QTO "not configured" empty state (`use-script-execution.ts` returns `notConfigured` flag; `QTODashboard.tsx` renders empty state).
- Upload error UX: three error classes + `friendlyUploadError` mapper in `UploadContext.tsx`; en/nb strings for `errorTooLargeForServer / Network / Aborted / Generic`.
- Sidebar Search button disabled with tooltip; en/nb `searchComingSoon`.
- PlatformPanel eye-icon (model visibility) affordance: default opacity 0 → 50%.

### Architectural decisions captured
- **Persistent viewer rule.** UnifiedBIMViewer mounts once per modelId; filter/selection mutates `isolation` / `typeVisibility` / `floorCodeFilter` props. Never remount on interaction. Memory entry `feedback-viewer-persists-isolation-drives-state.md` added.
- **Three primitives in the spine.** Claims (AI-extracted statements, confidence-graded → ProjectConfig) vs Annotations/Proposals (overlays on source entities, exportable as fork-creating psets) vs Issues (routed work tickets, manual or auto-assigned). They compose explicitly; don't conflate.
- **Source-is-sacred contract.** Exporting accepted Annotations as IFC psets MUST fork the source model with provenance. Original is never silently mutated.
- **Dashboards view, workbenches annotate.** Two distinct surface types per entity. Mapping workbench is the prototype; pattern needs to spread.
- **Deprecate or develop, never undefined limbo.** Default is NOT cut — every piece of complexity gets an explicit verdict.

## Technical Details

**Persistent-viewer fix mechanics.** The old InlineViewer keyed on `selectedType.id` / `class:${activeIfcClass}` AND switched between two completely different render trees (HUDScene vs `<GuidOverrideViewer/>`). Each click forced an unmount + new fragments load + a race where the previous mount's in-flight fetch resolved against a torn-down `worldRef.current.camera.three` and threw. The fix mounts `UnifiedBIMViewer` directly with isolation = `null` when nothing selected, `{guids, mode: 'all', zoomOnChange: true}` otherwise. UnifiedBIMViewer's existing isolation effect (`UnifiedBIMViewer.tsx:2394`) hot-swaps via the Hider; no remount, no fetch.

**ModelWorkspace layout regression + fix.** Initial swap to `<ViewerPane>` dropped `flex` from the parent grid cell, so DashboardTile's `h-full w-full` resolved against an auto-height parent and the canvas collapsed to 0 in some grid paint orders (user reported "Viewer world unmounted before v3 fragments load began" on the model dash). Restored `flex` on the parent + `flex-1 min-w-0` on the ViewerPane className. Build green after the fix.

**Why `/dev` moved out of the webapp.** Initial build was a React page at `sprucelab.io/dev`. User pushed back: agents/sessions have filesystem access; the URL adds rebuild cycle for no real win. Moved content verbatim to `docs/dev.md`; reverted App.tsx route + deleted `DevHub.tsx`. Net effect: single source, no build coupling.

**Pushback discipline.** Twice this session I reflexively reached for "cut" (filter URL roundtrip, TypeBank cross-project writes). Twice the user corrected me — the first is a forward-deployed embed gateway drug that needs the share button completed; the second is foundational data that compounds value even without UI today. Reframed the audit lens to "deprecate or develop" and saved this pattern in `docs/dev.md` so the verdict is explicit, not implicit.

## Next

1. **Annotations / proposals primitive** — new first-class entity model. Target = any source data; `proposed_value` JSON; `export_action` (none / pset-writeback / forks model). Parallel to Claims, distinct from Issues. Required before LCA, material substitution, drawing annotations, instance overrides can land.
2. **Issues route + primitive** — `/projects/:id/issues` referenced from MyPage but doesn't exist. Build the route + the Issue model + the auto-generation hooks (verification failures, Annotation route-for-review, Claim rejections with action).
3. **Auto-analysis fix** — drop `.delay()`, run `run_model_analysis_task(model_id)` synchronously in `processing-complete` so the manual "Run Analysis" button is no longer needed. Alternative: add Celery worker service to `railway.toml`. Pick one.
4. **Share-view button** — `?d=base64` encoder/decoder is shipped; add a "Copy view link" affordance in FilterChips on every dashboard. This is the marketing gateway drug.
5. **Cross-filter integrity audit** — confirm same-click-toggles-off, counts agree across tiles, count-up animation everywhere, persistent viewer on every surface.

## Notes

- **`docs/dev.md` is now the canonical project tracker.** Every session reads it first; every ship updates it. Don't put progress state anywhere else (CLAUDE.md, MEMORY.md, planning docs, etc. all defer to this file).
- Three commits + one tracker-update commit landed on `main` in this session: `8434672`, `1919bf6`, `bcc973f`, `5633c92`. Vercel deployed all of them; bundle hash currently `index-C88PC-GS.js` (the main chunk reverted to its pre-/dev state because DevHub was removed; chore-batch changes are in side chunks).
- `frontend/src/components/features/model-workspace/AnalysisDetailsRail.tsx` is functionally a duplicate of `warehouse-v2/TypeDataRail.tsx` (its own file comment admits it). Unification deferred — not finish-line work per the current framing, but documented as a follow-up.
- The complexity audit's other findings (synth GUID schema honesty, scripting/automation/field aspirational apps, warehouse v1 deprecated-not-deleted) are all recorded in `docs/dev.md` Deprecate-or-Develop section with explicit verdicts.
