# Session: Filter reset fix + ModelWorkspace rework (rail polish, header navigator, KPI relayout)

## Summary
Five commits to `main` covering one urgent fix and four ModelWorkspace upgrades. The user opened with the "still not fixed" filter-persistence bug (changing model leaves stale filters from a different model's IFC schema), then layered in three additional asks while work was running. All five commits passed Vercel + Railway Django + Railway FastAPI deploys; production verified live on www.sprucelab.io.

Pre-existing context from earlier today: Phase 3b (Types-v2 rail polish + v1 keyboard parity) shipped as commit `67dc026` before /clear. This session continued that thread by carrying the same rail polish across to ModelWorkspace and unifying the filter-reset behavior between the two surfaces.

## Changes

**`67dc026` — Phase 3b on Types-v2** (pre-/clear, included for context):
- `frontend/src/components/features/warehouse-v2/TypeDataRail.tsx`: status pill (STATUS design tokens, no hex), 4-button quick-action row (save/flag/ignore/copy GUID), collapsible notes editor, shortcut hint footer
- `frontend/src/components/features/warehouse-v2/TypeViewerPaneV2.tsx`: rail widened `200-300px → 280-420px`; new callbacks threaded down
- `frontend/src/components/features/warehouse-v2/TypeBrowserV2.tsx`: window-scoped keyboard handler (ArrowLeft/Right navigate + clamp, A=mapped, F=followup, I=ignored, Shift+F/F11 toggles fullscreen overlay, Escape exits). Input/textarea guard. Uses existing `useUpdateTypeMapping`/`useCreateTypeMapping`. Synth GUIDs disable Copy
- `frontend/src/i18n/locales/{en,nb}.json`: `typesV2.rail.{status,action,notes,shortcutHint}` + `typesV2.shortcuts.*`

**`b3b806c` — fix(filters): clear cross-filter dimensions on model change**:
- NEW `frontend/src/hooks/useResetFiltersOnModelChange.ts`: clears all dimensions on modelId transitions, including first mount from another page. Carve-out: `?d=...` URL deeplinks honored (the `useProjectFilterUrl` hydration hook in `<ProjectShell />` owns that case)
- Applied to `pages/ModelWorkspace.tsx` (replaces previous skip-first-run ref) + `components/features/warehouse-v2/TypeBrowserV2.tsx` (model dropdown now wipes everything; the targeted type_guid reset still fires on ifc_class/search narrow)

**`8933582` — feat(model-dash): header model navigator**:
- `pages/ModelWorkspace.tsx`: Prev / Select dropdown / `n/N` counter / Next button in the header. Hidden when project has only one model. Sorted newest-first to match the listing
- `frontend/src/i18n/locales/{en,nb}.json`: `modelDash.nav.{prev,next,atStart,atEnd,selectPlaceholder}`

**`1b7f9e7` — feat(model-dash): rail polish + edit affordances**:
- `frontend/src/components/features/model-workspace/AnalysisDetailsRail.tsx`: status pill, quick-action row (save/flag/ignore/copy GUID), collapsible notes editor, shortcut hint footer. Falls back to read-only when no IFCType match
- `pages/ModelWorkspace.tsx`: cross-references AnalysisTypeRecord → IFCType via `useModelTypes` (match `ifc_type === type_class && type_name`). Window-scoped keyboard handler for A/F/I at the AnalysisDashboard level. Mutations through `useUpdateTypeMapping`/`useCreateTypeMapping`. Toast via `useToast`
- `frontend/src/i18n/locales/{en,nb}.json`: `modelDash.rail.{status,action,notes,shortcutHint,shortcuts}`

**`4941691` — feat(model-dash): KPI rework**:
- `components/features/model-workspace/AnalysisKpiCluster.tsx`: Reuse leaves slot 5; Requirements x/n placeholder enters as slot 1 (pending EIR module). Card count unchanged
- `pages/ModelWorkspace.tsx`: bottom row goes from Quality | Geometry (each `col-span-3`) to Quality | Reuse | Geometry (each `col-span-2`). New `ReuseCard` component with large %, mapped/total subtext, horizontal fill bar. New `GeometryBarVertical` standing bar chart (one column per representation, value above bar, color-tinted label below). Dead `GeometryClassTable` + `GeometryClassRow` removed
- `frontend/src/i18n/locales/{en,nb}.json`: `modelDash.kpis.{requirements,reuseHint,pendingEir}`

## Technical Details

**Filter reset hook semantics.** The bug was that `ProjectFilterProvider` is keyed on `:id` (project), not model. When a user navigates Types → ModelWorkspace within the same project, the provider stays mounted and filter state persists. ModelWorkspace's old guard skipped the first run (so URL deeplinks survive), but the side effect was that entering from another page with filters from a stale context left those filters intact.

Solution: hook clears on `modelId` transitions including null → first-set, but reads `URLSearchParams` for `?d=` on the first-mount path and skips the clear if a deeplink is present. After that, every transition clears unconditionally. Centralizing in one hook means TypeBrowserV2 + ModelWorkspace share the same rule.

**AnalysisTypeRecord → IFCType cross-reference.** AnalysisDetailsRail operates on the analysis payload (no `type_guid`, no `mapping` link). To enable save/flag/ignore + notes from ModelWorkspace, we look up the matching IFCType via `useModelTypes(modelId)` and match on `(ifc_type === type_class, type_name)`. When no match (e.g. analysis ran before extraction), the rail falls back to the analysis-only read view — actions hide, pill hides, notes hide.

**`mapping_status` vs UI labels.** The backend enum is `pending | mapped | ignored | review | followup`. The UI uses "Flagged" for `followup` (matches the F-key intent). The pill maps follow the STATUS design tokens: `mapped→success`, `followup→warning`, `review→info`, `ignored→neutral`, `pending→neutral`. STATUS tokens (`solid/bg/text/glyph`) are consumed via inline `style={{ background: token.bg, ... }}` — they're `oklch(...)` strings, no hex literals introduced.

**Keyboard handler co-location.** Pattern lifted from `frontend/src/hooks/use-type-navigation.ts:132-176` but written inline as a `useEffect` in each surface (TypeBrowserV2 + AnalysisDashboard). Window-scoped so keys fire regardless of which sub-component has focus. Guard: skip when `e.target` is INPUT / TEXTAREA / SELECT / `isContentEditable`.

**Standing bar chart.** New `GeometryBarVertical` replaces the previous horizontal `GeometryBar` in the bottom-row Geometry card. Each representation gets one vertical column, scaled by `value / max`, with the count printed above the bar and the (truncating, color-tinted) label centered below. `DrillTarget` wraps each column for primary-click cross-filter.

## Next
1. Walk the deployed site (www.sprucelab.io) on a real project to verify the rail edits round-trip through the API (save → re-fetch → pill changes; notes blur → persist → reload → notes restored)
2. The Types v2 rail status pill text "Flagged" maps to `mapping_status: 'followup'` — consider unifying the wording end-to-end (either rename the enum to `flagged` or only show "Follow-up" in the UI). Cosmetic, not urgent
3. Decide what data source the Requirements x/n card should consume — the EIR module is queued for Phase 7 per the frontend roadmap; until then this card is intentionally a placeholder
4. The orphaned `TypeDetailPanelV2.tsx` (332 LOC, wider 6-col layout, never imported) — leave for now or delete in a cleanup PR
5. Earlier-session carry-overs still parked: cache-miss spike mitigation (Supabase JWT introspection rework), `PROFILE_QUERIES=True` on prod, FederatedViewer self-heal, viewer P0s

## Notes
- All five commits passed type-check, build, and Vercel + Railway Django + Railway FastAPI deploys
- The 3-day-old `frontend-refresh-roadmap.md` memory was wrong on Phase 3b status (claimed nothing existed; reading code showed TypeDataRail already had triple/props/layers/psets at compact density). Lesson: verify memory against current code before planning — applied the "verify agent diffs before applying" rule (`feedback-verify-agent-diffs-before-applying.md`) to memory claims too
- User added three follow-up requests mid-execution (rail polish on model dash, header navigator, KPI rework). All addressed in this session as separate commits per the "one focused PR" preference, though the four ModelWorkspace commits all touch the same page — could have been bundled, but each commit message reads cleaner standalone
