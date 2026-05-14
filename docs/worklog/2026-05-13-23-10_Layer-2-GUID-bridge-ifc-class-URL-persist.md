# Session: Layer 2 GUID bridge + ifc_class URL persistence

## Summary

Two focused frontend PRs that complete the URL-driven, cross-filter-composable Types page. Layer 2 promotes `type_guid` (IFC GlobalId of the IfcTypeObject) to a first-class filter dimension in `ProjectFilterProvider`, mirroring how Layer 1 promoted `AnalysisStorey.guid` to `floor_code`. The follow-up lifts `ifcClassFilter` from local component state into the provider's existing `ifc_class` dimension so treemap class clicks also round-trip via `?d=...`. Net effect: every interactive surface on Types page v2 (Top-10 bar, table row, treemap class cell) writes to a shareable, cross-page-composable URL filter; reload and shared links preserve selection.

Both PRs verified live on www.sprucelab.io via chrome-devtools — URL round-trip, toggle, reload-persistence, and cross-key composition all confirmed.

## Changes

### Commit `dcdc475` — Layer 2 GUID bridge

- `frontend/src/lib/embed/types.ts` — added `type_guid?: string[]` to `FilterContext` + `createFilterContext`. Schema-additive change, no protocol bump (per the rules in the file header).
- `frontend/src/contexts/ProjectFilterProvider.tsx` — `type_guid` added to `ArrayDimensionKey` union; `setTypeGuid` action creator added to `useProjectFilterActions` and wired into the memo deps.
- `frontend/src/hooks/useProjectFilterUrl.ts` — round-trip `type_guid` in `projectToPayload` (mirrors the floor_code line).
- `frontend/src/components/features/warehouse-v2/TypeBrowserV2.tsx` — `selectedTypeId` lifted from local state to provider-derived state via `filterCtx.type_guid?.[0]`. Local fallback state for null-guid types (defensive; never triggered in current data since the extractor produces synth-prefixed hashes for proxy/userdef). Mount-skip ref on the reset effect so a URL-hydrated `type_guid` survives the first render.

### Commit `ff23c67` — ifc_class URL persistence

- `frontend/src/components/features/warehouse-v2/TypeBrowserV2.tsx` (same file, follow-up) — `[ifcClassFilter, setIfcClassFilter]` replaced with read-side `filterCtx.ifc_class?.[0] ?? 'all'` + a `setIfcClassFilter` adapter callback that preserves both the direct-string and functional-update call sites (e.g., `setIfcClassFilter((curr) => curr === cls ? 'all' : cls)` keeps working). All other call sites untouched.

## Technical Details

**Layer 2 design philosophy.** Same as Layer 1: the canonical IFC identifier (GlobalId for storeys / type objects) is the user-visible state; internal Django IDs become derived state where still needed for downstream component props (`InlineViewer typeId={selectedType.id}` continues to receive Django UUID, but `selectedType` itself is now resolved from `type_guid`). This keeps the existing component tree intact while making the cross-filter key URL-shareable and cross-model-stable.

**Why no backend changes.** The `IFCType.type_guid` field already exists (added in earlier work; serialized via `IFCTypeWithMappingSerializer`) and was already round-tripping to the frontend as `IFCType.type_guid: string | null`. The viewer-side GUID-isolation pipeline (`UnifiedBIMViewer` `IsolationConfig.guids`, lines 378-524) was already consuming instance GUIDs. The only gap was the cross-filter store and URL serializer — exactly the four-file recipe shipped here.

**Synthetic-hash types.** Live verification turned up that `<untyped>` rows (IfcOpeningElement, IfcProxy, IfcBuildingElementProxy) have non-null `type_guid` of the form `synth_4093a37b9b838214a3` — the extractor generates a synthetic hash for types without an `IfcTypeObject` (per the existing data-extraction-vs-fragments-runtime-mismatch convention). These round-trip through the URL just like real 22-char IFC GUIDs. The local-fallback state path I added for truly null `type_guid` is defensive and was never triggered on real data.

**Mount-skip ref subtlety.** The original reset effect cleared `selectedTypeId` whenever `[modelId, ifcClassFilter, searchQuery]` changed, including on initial mount with their initial values. After the lift, this would wipe a URL-hydrated `type_guid` before the user ever interacted. Added a `selectionResetMountedRef` to skip the first run. The first time the effect actually clears selection is when one of the deps changes due to user input.

**ifc_class adapter shape.** The provider's `ifc_class: string[]` is multi-select; the Types page UX is single-select with `'all'` as the unset sentinel. Adapter callback handles both: `value === 'all' ? undefined : [value]` on writes, `filterCtx.ifc_class?.[0] ?? 'all'` on reads. Other consumers of the provider (FederatedViewer, ViewerFilterPanel) see whatever the user picked on the Types page when they nav over, which is the intended bidirectional cross-filter behavior per memory `single-project-filter-store-bidirectional.md`.

**Live verification (chrome-devtools).** Clicked "Maling 200" in Top-10 → URL gained `type_guid: ["0cfAb$UiMw6u7UKfDg5E6r"]` composed with the persisted `floor_code`. Reloaded → both keys preserved (mount-skip ref works). Clicked again → `type_guid` toggled off, `floor_code` retained. Clicked the `<untyped>` row → URL gained `type_guid: ["synth_4093a37b9b838214a3"]`. After the follow-up commit, clicked "Filter by WallType" in the treemap → URL gained `ifc_class: ["IfcWallType"]` composed with the rest. All cross-filter combinations round-tripped cleanly. No new console errors; pre-existing `Fragments: Model not found` errors from the viewer remain (viewer perf is parked per memory).

## Next

1. **Layer 3a (#15) — grouping axes backend.** Apply the same five-file recipe template: `AnalysisSpace.guid` + `AnalysisZone.guid` + `AnalysisSystem.guid` + `AnalysisOpening.guid` as first-class filter dimensions. Pure backend extraction + serializer + endpoint; unlocks per-room / per-system / per-opening cross-filter (#17–#22).
2. **Floor-aware Types page (multi-stack).** Today the Types page renders `instance_count` totals; when `floor_code` is set, types should narrow to those with instances on that storey. Data already exists (`AnalysisTypeStorey` linked via `AnalysisType` → `IFCType`); needs (a) `AnalysisTypeStoreySerializer` to include `storey.guid`, (b) a frontend hook that fetches and joins, (c) intersection in `filterTypesV2`.
3. **Phase 1 of #14 — Dashboard engine extraction.** `useDashboardFilter()` + `<DashboardSurface>`, port Types first. Now that the Types page cross-filter is fully URL-driven, the extraction has a cleaner anchor.
4. **Settings architecture (#10) — Dalux gear shell.** Tabbed shell at `/projects/:id/settings` (Access · Modules · Setup · My page · Integrations). Existing `ProjectSettingsPage.tsx` is the EIR builder; would nest under "Setup". Wireframes light at `docs/wireframes/admin.html` but no dedicated settings-shell wireframe — needs fresh design.
5. **Phase 3b.1 (small) — KPI sparkline polish.** Memory note says "render but visually subtle, ~10 lines". Scope ambiguous from one-liner; needs a session where the user looks at the live page and points at what should change.

## Notes

- **Trunk-based discipline working.** Both PRs landed straight on `main`, deploys (Vercel + Railway Django + Railway FastAPI) all green per `feedback-verify-deploys-after-push.md`.
- **Layer 1 / Layer 2 / ifc_class symmetry is real.** Three GUID-or-canonical-key dimensions now ride in the same provider, same URL key, same toggle semantics. Layer 3a should drop in via the same recipe with no architectural surprise.
- **`feedback-coordinator-rounds-ship-invisible-work.md` compliance.** Two focused, visible-on-the-URL ships in one session; no backend-only round, no scaffold without payoff.
- **Plan file** at `~/.claude/plans/lets-pick-up-where-delegated-rabin.md` documents the Layer 2 scope as approved + executed. Safe to leave or delete.
- **Pre-existing viewer error noise** (`Fragments: Model not found` from v3 storey lookup against an unloaded model) surfaced during verification. Diagnosed, not fixed — per `feedback-viewer-perf-rabbithole.md` viewer fixes wait for Phase 4 or explicit ask.
