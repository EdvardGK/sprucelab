# Session: Phase 3 — Type page v2 first cut (?v=2)

## Summary

First single-track, frontend-first session under the post-round-7 directive.
Shipped Phase 3's anchor PR as a *first cut* — the four-section
skiplum-reports layout at `/projects/:id/types?v=2`, wired to real model
data, v1 untouched. Heavier scope from the original plan (detail pane,
manual classification, cards toggle, materials port, cross-filter into
`useProjectFilter`) was explicitly deferred to follow-ups.

One commit, one push, both deployments verified.

## Changes

### `feat(types): Phase 3 Type page v2 first cut at ?v=2` (commit `e41c272`)

**Route gate** — `frontend/src/pages/ProjectTypesPage.tsx`
- Reads `?v=2` from `useSearchParams`. When present, renders the new
  `<TypeBrowserV2 />`. Otherwise unchanged v1 render path (with
  viewport-lock + classic 3-column TypeBrowser).

**New directory** — `frontend/src/components/features/warehouse-v2/`
- `TypeBrowserV2.tsx` — orchestrator. Owns `modelId`, `searchQuery`,
  `ifcClassFilter`. Defaults `modelId` to first model from
  `useModels(projectId)`. Filters types client-side (search + IFC class).
  Wraps content in `flex flex-col gap-4 px-6 py-6 max-w-[1600px]
  mx-auto` — plain containers + padding, no ratio system (per
  `feedback-keep-layouts-simple.md`).
- `TypeBrowserHeaderV2.tsx` — page title + subtitle + 4 stat tiles
  (Total types · IFC classes · Instances · Mapped %) computed
  client-side from the types array. Tiles use `<DashboardTile>` from
  `components/Layout`. "Switch to classic view" link strips `?v=2`.
- `TypeBrowserFilterBarV2.tsx` — single rounded card with search input
  + model select + IFC-class select + count. Filter state lives in the
  parent; this is a controlled component.
- `TypeTreemap.tsx` — squarified treemap using `lib/treemap.ts`'s
  `treemapLayout` (the same util `ModelWorkspace`'s treemap uses).
  Reuses the 12-color palette from `ModelWorkspace` (forest +
  lavender + lime + navy + extended). `aspect-[16/9]` inside a
  `<DashboardTile>`. Tooltips via `title=`; no cross-filter yet (TODO
  for Phase 3b).
- `TypeTopBarList.tsx` — top-20 types by instance count as horizontal
  flex bars normalized to widest. No recharts dep (kept it simple).
- `TypeTableV2.tsx` — flat table with 6 columns: IFC class · type name
  · instances · NS3451 · status pill · coverage strip. Status pill
  prefers verification status (verified/flagged) over mapping status.
  Coverage strip is a derived 0–100 metric from `mapping.ns3451_code`,
  `representative_unit`, `definition_layers.length`, and
  `verification_status === 'verified'` — first-pass approximation, can
  be tuned against real EIRs in Phase 3b.

**v1 cross-link** — `frontend/src/components/features/warehouse/TypeBrowser.tsx`
- Small "Try the new Types page →" button in the header bar, sets
  `?v=2` and triggers re-render.

**i18n** — `frontend/src/i18n/locales/{en,nb}.json`
- New `typesV2.*` namespace (~30 keys) in both locales. Norwegian uses
  proper æ/ø/å throughout.
- Added missing `status.verified` + `status.flagged` to the top-level
  `status` namespace (they only existed under `typeLibrary.verification.*`
  before).
- Added `typeLibrary.tryV2Link` for the v1→v2 link.

## Technical details

**No new dependencies.** Considered recharts for the bar list but stuck
with hand-rolled flex bars — matches the rest of the codebase's chart
style and keeps the bundle small.

**No backend changes.** Page is single-model scoped via the existing
`useModelTypes(modelId)` hook. A project-wide aggregation hook is out
of scope for this cut; it can be added later if cross-model views
become a requirement.

**Memory drift caught**: `frontend-refresh-roadmap.md` claimed Phase 0
added a `size` policy prop to `DashboardTile.tsx`. Reading the file
(`DashboardTile.tsx:6-9`), only `variant: 'default' | 'highlight' |
'accent'` exists. I did **not** add the size prop speculatively — the
v2 page works fine with the existing variant-only tile. Memory updated
to reflect reality.

**Plan-mode → auto-mode flow worked cleanly**: planned in plan mode,
got approval, executed in auto mode. Task tracker kept progress
visible. ~25 min from green-light to push.

**Verification end-state:**
- `yarn type-check` → exit 0
- `yarn build` → exit 0, `UnifiedBIMViewer` chunk warning is
  pre-existing (memory: ignore)
- `www.sprucelab.io` → 200, bundle flipped from `index-BHftUmRm.js`
  → `index-DZCR0yXW.js` (Vercel deployed)
- `sprucelab-production.up.railway.app/api/health/` → `{status: healthy,
  database: ok}`
- The actual `/projects/:id/types?v=2` browser smoke is **not** in this
  log — the route requires an authenticated session; user verifies in
  browser.

## Next

- **Smoke v2 in browser**: log into `www.sprucelab.io`, navigate to any
  project's Types page, click "Try the new Types page →", confirm
  treemap + top-20 + table render against real data. Click "Switch to
  classic view" to confirm round-trip.
- **Phase 3b** — detail pane on row click: inline `UnifiedBIMViewer` +
  `HUDScene`, classification triple, properties grid, layer buildup.
  Wires `useProjectFilter` cross-filter (click row → viewer isolates).
- **Phase 3c** — manual classification UI (ConfirmedClassPill +
  ClassificationCombobox).
- **Phase 3d** — cards view toggle.
- **Phase 3.x** — materials port at `/projects/:id/materials?v=2`.
- Coverage strip metric (`computeCoverage` in `TypeTableV2.tsx`) is a
  first approximation — tune against real EIRs once Phase 7 lands.
- Stale agent worktrees in `.claude/worktrees/` still pending cleanup
  (carried over from round 8).

## Notes

- Single-track frontend session worked as intended. No coordinator
  agents, no parallel tracks, one focused commit. The "must include
  frontend" rule from `feedback-coordinator-rounds-must-include-frontend.md`
  was honored trivially since the entire session WAS frontend.
- Avoided the temptation to add `DashboardGrid` named-cell layout for
  the two-viz row; a plain `grid-cols-1 lg:grid-cols-3` with `col-span-2`
  on the treemap was simpler and matches the user's "keep layouts
  simple" directive.
- The squarified `treemapLayout` util in `lib/treemap.ts` paid off — it
  exists from the ModelWorkspace work and just dropped into v2 cleanly.
