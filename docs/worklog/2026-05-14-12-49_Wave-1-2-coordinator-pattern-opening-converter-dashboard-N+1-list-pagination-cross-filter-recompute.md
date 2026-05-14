# Session: Wave-1+2 coordinator pattern — opening exclusion at converter, dashboard-metrics N+1 collapse, Types list pagination, Model-dash cross-filter recompute

## Summary

Four-commit session run as the coordinator over three parallel agents in isolated worktrees, with a parallel Claude session driving the live app and contributing one of the four commits' worth of work. Net product impact: opening voids no longer ship in `.frag` binaries, the dashboard-metrics endpoint went from ~11 queries to 1 per type queryset, the Types list endpoint now paginates with a thin serializer (was returning 7 MB for any non-trivial project), and every tile on the Model dashboard now recomputes + animates on cross-filter changes.

Top of `main`: `4f74633`.

## Changes

### Commits (in order shipped)

1. **`9ef1499` Track 1 — opening exclusion at converter.** `@thatopen/fragments` `IfcImporter.classes.elements.delete(IFCOPENINGELEMENT / IFCOPENINGSTANDARDCASE / IFCVIRTUALELEMENT)` runs before `process()` in `backend/ifc-service/scripts/convert-to-fragments.mjs`. Removes the viewer-side hide from `f99bb49` (`NON_PHYSICAL_V3_CATEGORIES` + the `setVisible(localIds, false)` block in `UnifiedBIMViewer.tsx`). Wall cutouts are preserved because web-ifc applies `IfcRelVoidsElement` during the host wall's geometry pass independent of whether opening elements are in the import allow-list. Cross-references the Python canonical list at `backend/apps/entities/services/verification_engine.py:534-541`.
   - Size delta on the test IFC (2.8 MB, 14 IfcOpeningElement) was ~5 bytes — heavy v3 compression eats the savings on small models. Expected to be more visible on production models with thousands of openings.

2. **`15d0718` Track 4a — `dashboard_metrics` N+1 collapse.** Per type queryset, ~11 sequential `.filter(...).count()` calls (classification / unit / material via `Exists` / verified_ok / verification_failed / verification_pending / mapped / pending / ignored / review / followup) collapse into one `.aggregate(...)` with `Count('id', filter=Q(...))` plus a single `Exists(TypeDefinitionLayer)` annotation. Project-mode endpoint drops from `2*(N+1) + N` queries to `N+1` aggregates. Measured locally: 53 → 4 queries (~13×) on a 3-model × 30-type fixture. Response shape preserved exactly — the agent audited every key in the spread response and matched empty/non-empty branches. Adds 5 new tests in `tests/unit/test_dashboard_metrics.py` covering JSON shape + query-count regression in both modes.

3. **`3167a68` Track 4b — Types list pagination + thin serializer.** Added `IFCTypeListSerializer` (drops nested `mapping` object + `properties` JSON blob; flat `mapping_status` / `ns3451_code` / `verification_status` / `representative_unit` projected via `source='mapping.X'`) and `IFCTypesPagination` (page_size=100 default, configurable via `?page_size=`, max 10000). `IFCTypeViewSet.get_serializer_class()` swaps based on action; `?expand=mapping` is the escape hatch to keep getting the heavy `IFCTypeWithMappingSerializer` from a list call. `get_queryset()` only applies `prefetch_related('mapping__definition_layers')` for retrieve or list-with-expand — the rest of the list path stays thin. Two existing callers (`useModelTypes` in `use-type-mapping.ts`, the list call in `use-project-materials.ts`) explicitly opt into `?page_size=10000&expand=mapping` so the mapping workflow keeps loading everything; every other consumer gets the lean paginated shape going forward.
   - Note for tooling: DRF uses `?page_size=`, not `?limit=`. The user's measured `?limit=50` returning 7 MB was a param-name mismatch — the param was silently ignored. The fix paginates correctly under the right param name.

4. **`4f74633` Track 2 — Model-dash cross-filter recompute (parallel-session-authored).** ModelWorkspace.tsx now computes `totalStats` (from unfiltered `analysis.types`) AND `filteredStats` (from `filterAnalysisTypes(analysis.types, filter)`). Foreground scalars across `AnalysisKpiCluster`, `QualityCard`, `VerifiedStoreyChart`, `GeometryBar`, `GeometryClassTable`, and the Top-N treemap all read filtered values and animate via `useCountUp`. Sparkline backdrops + class-color map keep using `totalStats` so the macro vocabulary (relative class sizes, color slots) stays stable. The treemap itself applies every facet except `ifc_class` so the user can keep clicking sibling tiles while a class filter is active. Mirrors the Types-page pattern at `warehouse-v2/TypeBrowserV2.tsx:152-175`.

### Memory captured

No new memories this session. Two existing memories applied repeatedly:

- `feedback-count-up-and-cross-filter-recompute-is-the-signature.md` — drove Track 2's design (filtered scalars + animate-via-useCountUp).
- `feedback-viewer-perf-rabbithole.md` — kept us out of the parallel session's extensive viewer P0 audit (lodSize cascade, Section Plane crash, Measure broken). Pinned for next session, not this one.

`next-steps.md` rewritten with deferred items.

## Technical Details

### Coordinator pattern over parallel agents

Each of the four tracks was scoped into an isolated git worktree via the Agent tool's `isolation: "worktree"` option, with disjoint file ownership briefed into each agent. Agents implemented + type-checked + built inside their worktree, then reported back a unified diff + verification summary + draft commit message. The main thread (coordinator) integrated by reading the worktree files and writing them into `main` directly with explicit `git add <path>` — never `git add -A` (per the submodule lesson from yesterday's `5449e15` mistake). Each commit included only the agent's owned files; the parallel session's in-flight uncommitted edits stayed parked in the working tree until their track's turn.

Wave 1 dispatched A + B + D in parallel. Wave 2 ran C sequentially after B committed (same file, disjoint line range — `types.py:741+` vs `types.py:27-67`). Track 3 (viewer remount) was a side-thread that produced a diagnosis but no fix.

Net cycle time: ~20 minutes of dispatch + parallel agent work + 30 minutes of sequential integration. Compares favorably to running four tracks single-threaded.

### Parallel-session coordination

A second Claude session was driving the live app with auth and concurrently making edits to the same repo. Detected mid-integration when `main`'s working tree showed:

- Two unannounced commits ahead: `909ff46` (god-mode observability) + `734e334` (admin redesign) — these absorbed the `STARTED_AT` / `GIT_SHA` uncommitted edits I'd noticed at session start.
- Uncommitted Track-2-style edits in `ModelWorkspace.tsx`, `AnalysisKpiCluster.tsx`, `VerifiedStoreyChart.tsx`.

User chose "Adopt parallel session's work" via AskUserQuestion. Killed Agent D (Track 2 implementer in isolated worktree) and committed the parallel session's diff as `4f74633`. The two implementations matched in shape — same `filteredTypes`/`treemapTypes`/`totalStats`/`filteredStats` split, both used `useCountUp`. No semantic divergence to reconcile.

The pattern that worked: explicit `git add <path>` per commit kept the parallel session's in-flight edits from leaking into Track 1 / 4a / 4b commits. The parallel session never committed itself — left the work in the working tree for me to pick up.

### Track 3 reframed mid-session

The original Track 3 goal was diagnosing "Viewer world unmounted before v3 fragments load began" via React profiler. Static reading of `UnifiedBIMViewer.tsx:1485-1517` + `:2070-2075` confirmed the error fires when `worldRef.current?.camera?.three` is null, which only happens via the init effect's cleanup running before a v3 load resolves — a legitimate parent unmount, not a viewer-internal issue.

But the parallel session diagnosed the real UX bug: filter state persists across model navigation via the URL `?d=` param. A user lands on Model B with `?d=` carrying `ifc_class:["IfcColumn"]` from Model A, the Types page filters to zero rows, and the empty state ("No data to visualize") reads identically to a backend failure. The user themselves was momentarily tricked. Static read of `ProjectFilterProvider.tsx:266-269` (`clearDimensions`) + `useProjectFilterUrl.ts:80-128` (`useEffect([], hydrated-once)`) + `ModelWorkspace.tsx:55-62` (model-nav guard via `prevModelIdRef`) confirms the flow: URL hydration on `ProjectShell` mount populates filters; the `ModelWorkspace` model-nav guard only fires on subsequent navs, not on the initial mount from a deep link.

Three P1 fixes (deferred to next session because they touch Model-dash files the parallel session was editing through most of the session):

1. **Empty-state messaging**: when `filteredTypes.length === 0` but `totalStats.totalTypes > 0`, render "X types hidden by filters — Clear" with an inline action. Stops the empty-state-equals-backend-failure confusion at the source.
2. **Filter chip prominence**: highlight active filter chips (red border / pulse) when the result set is empty so the cause is impossible to miss.
3. **URL filter validation on mount**: on first model load, intersect URL-derived filters against the active model's actual data; drop predicates that wouldn't match anything. Closes the root cause; touches the URL hydration effect.

### Frontend audit on the list-pagination switch

Agent C audited 9 callers of `/types/types/` and `/api/types/types/`:

- 2 callers needed changes (added `?page_size=10000&expand=mapping`): `useModelTypes` in `use-type-mapping.ts:94` and the list call in `use-project-materials.ts:424`.
- 7 callers were action endpoints (e.g. `/dashboard-metrics/`, `/summary/`, `/instances/`, `/verify/`, `/version-changes/`, `/export-*/`, `/claim-issues/`) — pagination doesn't affect those.
- The Python CLI (`cli/spruce/types.py:78`) already reads `body.get('results', body)` — handles both shapes.

The escape hatch (`?expand=mapping`) was a small scope expansion beyond the brief, justified because dropping the nested mapping entirely from list would have broken 8 components (`TypeBrowser`, `TypeMappingGrid`, `TypeMappingWorkspace`, `TypeLibraryView`, `TypeBrowserV2`, `TypeDataRail`, `TypeDetailPanelV2`, `TypeViewerPaneV2`). With the escape hatch in place, only the two hooks above carry the load and everything else keeps working.

### Parallel session's viewer P0 audit (deferred)

The parallel session posted a substantial follow-up audit late-session covering:

- **lodSize cascade (P0)** — fragments constructed without `geometry.fragment.userdata.lodSize` populated cause Section Plane (S) to blank the canvas with no recovery short of full reload. Measure tool (no annotation produced) and picker likely fail for the same reason. The lodSize-undefined access is suspected to corrupt the render path globally.
- **Pixel ratio (P0)** — DPR clamped to 0.9 somewhere. User wants `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` with adaptive quality on interaction.
- **Section Plane recovery (P0)** — needs try/catch + scene-state snapshot so toggle-off explicitly re-enables disabled material paths.
- **Camera home + bounding-box outlier filter (P1)** — orphan geometry at distance trips Fit-to-View; bounding box should exclude statistical outliers before fit; persist a `homeCamera` on first frame.
- **Filter counts should respect visibility (P1)** — hiding a model drops the visible count but the filter panel still shows project-wide totals.
- **Picker / Properties panel (P1)** — adopt `BIM.Highlighter` (hover/select/isolate sets) + `BIM.ItemAttributes` + `BIM.ItemPsets`.
- **Eye icons always-visible (P2)** — hover-only visibility hurts discoverability.
- **Debug resolution overlay (P2)** — `1806.67px × 1537.78px` overlay accidentally enabled in prod.
- **Default class list to geometric entities (P2)** — bury `IfcPropertySingleValue` / `IfcPropertySet`; surface real fabric classes first.
- **Storey grouping (P2)** — merge duplicate storeys by elevation; flag "Undefined / N" with a warning treatment.

Plus practical guidance on adopting more of the ThatOpen kit (`Clipper`, `LengthMeasurement`, `OrthoPerspectiveCamera`, `IfcPropertiesProcessor`, `IfcStreamer`, `Marker` for BCF-compatible comments, `Stats` for the debug overlay).

These are pinned for a dedicated viewer-quality session. Per `feedback-viewer-perf-rabbithole.md` we don't take them on incrementally — they need a planned session with budget.

## Next

1. **Track 3 UX fixes (filter persistence)** — empty-state messaging + filter chip prominence + URL filter validation on mount. Three P1 fixes, all in Model dash + Types page surfaces. Composes naturally with Track 2's filtered/total split that just shipped.
2. **Viewer-quality session** — separate, planned session for the parallel session's P0/P1 viewer findings. lodSize cascade is the keystone (it's blocking picker, Section Plane, Measure, picker-fed Properties panel).
3. **DRF pagination param-name reconciliation** — tooling that expected `?limit=` should switch to `?page_size=`. Could land a graceful `limit→page_size` shim in `IFCTypesPagination` if any third-party tool depends on the older name.
4. **Re-verify prod dashboard-metrics latency** — user's measured 3.6 s / 7.5 s tail should drop to <500 ms with the aggregate collapse + (eventually) a region/Cloudflare improvement for the 480 ms RTT baseline. Worth a chrome-devtools network-panel timing pass once the deploy has settled.

## Notes

- Trunk-based discipline held: 4 commits direct to `main`, each verified locally before push.
- Coordinator pattern worked cleanly. Three agents in parallel + one parallel external session ≈ 4× throughput on a 1-hour session, with no merge conflicts (one near-miss when the parallel session and Agent D collided on Track 2 — surfaced + resolved via AskUserQuestion).
- `git add <explicit path>` rule held through 4 commits despite the working tree carrying uncommitted parallel-session edits the whole time. Zero accidental sweep-ins.
- Agent B violated the "never `rm` without approval" rule on `/tmp` scripts — flagged in the security warning. Per CLAUDE.md the rule applies broadly. Worth a brief reminder in agent briefs for next session.
- Backend perf wins from this session are visible to every user (4-second dashboard-skeleton wait → likely <500 ms once deploy settles). Count as frontend-first work per `feedback-frontend-first-until-app-feels-real.md` even though the diffs are backend-side.
- Track 1's converter change only affects newly-converted models. The 8 prod projects' existing `.frag` files still contain opening geometry. A one-shot reanalysis pass would land the improvement everywhere — pinned in next-steps.

---

## Addendum (2026-05-14 13:00) — Model-dash UX follow-up after live testing

User immediately surfaced two cross-filter UX gaps after live testing of `4f74633`. Both shipped in `e07cd1d` as a single follow-up commit.

### What changed (`e07cd1d` — `feat(model-dash): treemap self-filters + click-to-toggle + Clear filters bar`)

- **Treemap self-filters.** Removed the `treemapTypes` adapter that the parallel session had introduced to keep sibling tiles visible by stripping `ifc_class` from the treemap's filter input. After live use the user pushed back: "the treemap doesnt filter." The Types-page pattern at `warehouse-v2/TypeBrowserV2.tsx` passes the fully-filtered set, and the user wanted parity. The treemap now reads `filteredTypes` and collapses to the active selection on click — the only way back to all-classes is Clear (added below).
- **Click-to-toggle.** Both `filterByIfcClass` (treemap) and `filterByStorey` (storey chart) now check whether the dimension is already `[clickedKey]` and clear it instead of re-setting. Closes the user's "click the same tile to turn off doesn't work" report. Previously the only escape was the X on the FilterChips chip buried in the viewer canvas overlay.
- **Active-filter bar.** New bar above the KPI cluster, visible only when `activeFilterCount > 0`. Layout: `N filters active` label · inline `<FilterChips />` · big right-aligned **Clear all filters** button (signal-orange, generous padding, oversized X icon). The Clear handler calls `clearDimensions()` from `useProjectFilterActions`, which wipes every dimension the shared store carries — not just the three the dashboard surfaces (ifc_class / floor_code / type_guid). The count derivation pulls from nine dimensions to keep the badge honest. Bar uses `border-signal/40 bg-signal/10` so it composes with the design-tokens iron rule (`feedback`-style `signal` family is the canonical "this is an active selection" vocabulary).

### Note on the opening-element question

User asked mid-commit: "is the opening element rendering turned off?" Answer noted to them inline: the converter fix is shipped, but existing prod `.frag` files were generated before `9ef1499` and still contain the opening geometry. Backfill via re-conversion across the 8 prod projects is still pinned in `next-steps.md` — not run this session.

### Commit count

Five code commits + one worklog + one worklog addendum:

1. `9ef1499` Track 1 — opening exclusion at converter
2. `15d0718` Track 4a — dashboard-metrics N+1 collapse
3. `3167a68` Track 4b — Types list pagination + thin serializer
4. `4f74633` Track 2 — Model-dash cross-filter recompute (parallel-session authored)
5. `e07cd1d` Model-dash UX follow-up — treemap self-filter + toggle + Clear bar
6. `a6a72a7` Worklog (this file)
7. (this addendum + `next-steps.md` update pending the wrap-up commit)

Top of `main`: `e07cd1d`.

### Memory candidate

Live-testing surfaced a small but recurring pattern worth capturing: when implementing cross-filter on a chart, default to "click-same-tile-toggles-off" — the user finds it intuitive enough that its absence reads as broken. The escape-via-X-on-chip path was technically present (FilterChips in the viewer overlay carries it) but discovery was zero because the dashboard surface didn't expose it. Worth a feedback memory if the pattern recurs on Types page or future surfaces.
