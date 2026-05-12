# Session: UI/UX redesign roadmap closeout — Sessions 1 through 8 (+ Materials reframe + ModelCard fix)

## Summary

The single-track redesign roadmap proposed in `docs/plans/2026-05-12-15-44_Unified-UX-Audit-and-Redesign-Plan.md` is complete. Eight sequential sessions plus two mid-flight iterations (Materials full reframe after user redirect, ModelCard fix after user feedback) shipped end-to-end on `main`, top commit `c947d3e`.

Ten of ten audited surfaces now carry the same chrome (PageShell), the signature `useCountUp` interaction, modelers-own-data framing (raw counts + amber em-dash, no "Mapped %"), and Linear-pillar discipline (quiet sidebar, tactical workspaces, click-on-data cross-filter, compose-don't-reflow). The Types page bar is no longer the only surface that hits it.

## Why this run mattered

This run was the user's response to a four-track lift session that shipped infrastructure (`DashboardTile`, `useCountUp`, `Sparkline`) but didn't reach all surfaces. The user's feedback was direct: "the project config is legit horrible," "model dash bottom half blank on 27"," "type viewer doesn't show filtered model objects," "materials needs a smart dash, not a browser." The right move was an audit-first single-track loop, not another coordinator round — and that's what this run delivered.

## Sessions, in order

### Session 1 — PageShell primitive + bug fixes + Types hero trim
**Commit**: `27d402e` · **Files**: 8

- New `<PageShell title subtitle headerRight>` component (gradient strip + clamp header + page padding + no viewport lock). The chrome primitive every other page would adopt.
- Bug 2 fix: dropped `h-full overflow-hidden` + inner `overflow-y-auto` + swapped fixed `h-[220px]/h-[280px]` for `min-h-[clamp(...)] flex-1` on `ModelWorkspace.tsx`. The 27" no longer has a dead grey bottom half.
- Types hero trim: `h-[clamp(560,calc(100vh-14rem),1100px)]` → `h-[clamp(420,calc(100vh-22rem),720px)]` + 25% padding cut on KPI tiles. Top-10 + table now visible above the fold on 1440×900.
- Retrofitted Types / Materials / ProjectSettings to use PageShell.

### Session 2 — IFC Models page redesign
**Commit**: `7d1775e` · **Files**: 9 (4 new)

- Project-level KPI row (6 tiles): models / elements / storeys / file size / avg processing time / latest upload. `useCountUp` + sparklines + tone rings + amber em-dash where data is missing.
- Model card rewrite: `h-[clamp(220px,28vh,260px)]`, 180-square mini viewer + name + version + status + tiny KPI strip + top-3 IFC classes mini-bar list. Click → ModelWorkspace.
- New `useLazyViewerMount` hook with IntersectionObserver + module-level concurrency counter (cap 8).
- New `useProjectModelsKpis` hook (derives KPIs from `useModels()` — no new API).
- Dropped the 9-column table view, the chevron, the "Added X / v1 uploaded Y / by Current User" triple, and all "Mapped %" framing.

### ModelCard fix (mid-flight, after user feedback)
**Commit**: `92fdb31` · **Files**: 4

User reported: tall column stretches the model, viewer should match card background, only one viewer loads at a time. Three surgical fixes:

- Square viewer wrapper: `aspect-square w-[clamp(140px,12vw,180px)]` centered in the left column. Model no longer distorted by tall canvas aspect.
- `transparentBackground?: boolean` prop added to `UnifiedBIMViewer` (additive, default false) — wires through `WebGLRendererParameters { alpha: true }` + `setClearColor(0, 0)` + nulls the scene background. Pass-through prop on `InlineViewer`. ModelCard opts in. Model floats on `bg-card`.
- Serial-mount bug root cause: relying entirely on IntersectionObserver for already-visible cards; observer callbacks are async-after-layout and fire one-per-microtask. Fix: synchronously probe `getBoundingClientRect()` at hook init and `tryClaim()` immediately if visible. First N visible cards now mount in parallel.

### Session 3 — Bug 1 fix (Types-dash viewer class filter)
**Commit**: `4bc585e` · **Files**: 6

Frontend-only workaround for the long-standing class-filter isolation gap (backend extracts TYPE classes, fragments runtime exposes ENTITY classes):

- New `useTypesInstancesByClass(modelId, ifcClass)` hook: collects all types matching the class, fires `/api/types/{id}/instances/` in parallel, unions instance GUIDs.
- New `guidsOverride?: string[]` + `guidsOverrideLoading?: boolean` props on `InlineViewer`. When override is non-empty, mounts `UnifiedBIMViewer` with `isolation={{ guids, mode: 'all', zoomOnChange: true }}` directly.
- `TypeViewerPaneV2` swaps the `ClassFilteredState` placeholder for the real isolation flow when a class filter is active and no specific type is selected.

Backend `entity_ifc_type` field still queued for a future backend session; this is the frontend workaround that unblocks the user today.

### Session 4 — Materials density pass (later partially superseded)
**Commit**: `aee0cf1` · **Files**: 5

- Dropped the left family-tree column (duplicated treemap data).
- Dropped FamilyViewSwitch (treemap is the only view).
- Dropped LensSwitch (the four detail tabs already segment what the lens was emphasizing).
- Moved Materials/Sets pill toggle to the right edge of the filter bar (this was later rejected — see 4.5).
- Mini `InlineViewer` in the Definition tab when the material has type usage.
- Amber em-dash audit (no "Mapped %" anywhere).

### Session 4.5 — Materials Dash reframe (after user redirect)
**Commit**: `fcb50e9` · **Files**: 12 (4 new)

User redirected mid-Session-4: "I want a smart materials dash. QTO + cost + product mapping + LCA numbers are key… an all-purpose materials library/warehouse/knowledge hub." Plus two more messages: "sandwich/layered chart for layered, treemap/donut for mixed" and "a high-def shiny/dull material skin on a sphere preview, like Twinmotion/Blender/Rhino."

Eight moves:
1. Drop Materials/Sets toggle entirely (Sets is a TypeDefinition concept, not a Materials axis).
2. KPI row (six tiles): total materials / total quantity (dominant unit) / mapped to product / EPD-linked / total cost / total GWP. Em-dash + amber for missing data.
3. Treemap constrained to `aspect-[4/3] max-w-[clamp(360,40vw,640)]` + ResizeObserver-driven aspect — no longer full-width-short.
4. New `MaterialsTopN` ranking panel (axes: Quantity / Cost / GWP) right of the treemap; animated bar fills.
5. Materials table gains Product / EPD / Cost / GWP columns; sortable; cost/GWP columns auto-hide when wholly em-dash.
6. New `MaterialSandwichStack` viz for layered materials in Definition tab.
7. New `MaterialUsageDonut` (SVG, no chart lib) for non-layered materials.
8. New `MaterialSpherePreview`: vanilla three.js, `MeshPhysicalMaterial`, family-preset shader params (concrete/wood/metal/glass/insulation/masonry/membrane/polymer/finish/composite/technical/other), three-light rig, `alpha:true`, slow autorotate, lazy-mount via `useLazyViewerMount`.

The dash leaves explicit headroom for future LCA and procurement modules — it surfaces the numbers, doesn't replace the dedicated tools.

### Session 5 — EIR builder overhaul
**Commit**: `cb8a1fe` · **Files**: 13 (4 new)

User verbatim: "legit horrible from a UI/UX perspective. Needs a full overhaul." Six moves:

1. Route rename `/projects/:id/settings` → `/projects/:id/eir` with `<Navigate replace>` 302 from the old path; preserves `?mode`/`?tier` query params.
2. PageShell chrome with tier segmented control + mode toggle + "+ Add rule" button in `headerRight`.
3. Workspace reorganized as a structured document with one section per ISO 19650 tier (OIR / AIR / PIR / EIR). 1-col layout on lg-, 2-col on xl+. Uniform rule-card heights (`min-h-[clamp(140,16vh,200)] max-h-[clamp(280,38vh,440)]` + inner scroll). View mode renders `<dl>` label/value pairs with amber em-dash for empty values; edit mode keeps Track D's editable inputs + drag/X.
4. Tier segmented control filters BOTH workspace AND palette.
5. Permanent 14-18rem palette sidebar removed; replaced with a popover from "+ Add rule" — rule kinds grouped by tier when filter=All, flat when filtered. Drag-from-popover still works.
6. Preview panel at lg+ becomes 4 tabs: Document / Map (Kartverket) / 3D (EirIfcCubePreview) / IDS XML (stub for the upcoming backend export per `ids-as-interop-format.md`). md-: collapses to a "Preview" button → full-screen sheet.

### Session 6 — Sidebar quiet rewrite (Linear Pillar 2)
**Commit**: `eebd7b8` · **Files**: 3

- Dropped `bg-white/60 backdrop-blur-xl` glass — glass is for in-viewer HUDs only per `viewer-architecture.md`. Opaque `bg-card` + `border-r border-border`.
- Section labels: `text-[0.7rem] text-muted-foreground`, single-case, no uppercase, no tracking-wider.
- Active state: `text-primary font-medium` only. No slab pill, no background highlight.
- Stable tree across in/out-of-project: top-nav (My Page, Projects) + Current project (items conditionally render; section label stable) + Workbench (when in-project) + Tools. Section structure doesn't flip.
- Footer collapses to a single user-avatar `DropdownMenu` — name + email header, language submenu, help, sign-out. 4 footer items → 1.
- Stretch: `cmd/ctrl+B` toggles a collapsed icon-rail (~56px); state persists in localStorage; tooltips on hover.

### Session 7 — ProjectDashboard cleanup + ProjectsGallery refresh
**Commit**: `d49e0c7` · **Files**: 11 (5 new)

ProjectDashboard:
- PageShell chrome.
- Dropped the inner `<Tabs>` (Overview/Models/BIM/Floors) that duplicated sidebar nav. Single scrolling page.
- BIM tab content folded into the existing `HealthSignalsTile` (signals already there from Track B — no lift needed; just dropped the duplicate surface).
- Models tab dropped (sidebar `/models` owns it).
- Floors tab → new top-level route `/projects/:id/floors` + `ProjectFloorsPage` thin wrapper + sidebar entry.
- Dropped "Back to projects" button + viewport-lock pattern.
- ModelMiniCard grid below the fold dropped — duplicate of the IFC Models page.

ProjectsGallery:
- Dropped `container mx-auto` cap; PageShell chrome.
- 5-tile project-level KPI row: total projects / models / types / instances / storage. `useCountUp` + sparklines.
- Card reshape: `h-[180px]`, `minmax(280px,1fr)`, KPI strip + discipline sparkbar, `hover:border-primary/40` only (no shadow-glow).
- Sort chips (last activity / name / most models / most types) + filter chips (active / all / archived) above the grid.

### Session 8 — Claims / Documents / Drawings consistency pass
**Commit**: `c947d3e` · **Files**: 11 (6 new)

Three surfaces wrapped with the same chrome the rest of the app now wears.

Claims: PageShell + KPI row (open / mine / resolved-this-week / avg time-to-resolve). The existing `ClaimInbox` already had a complete tactical two-pane workspace with keyboard nav (←/→ A R S /), filter bar, status tabs — wrapped rather than rebuilt. Bulk actions stubbed but not added (would have broken the existing keyboard nav contract; flagged as TODO).

Documents: PageShell + 4-tile KPI row (total / with-claims / pending-review / classified). Format + status filter chips above the existing card grid.

Drawings: PageShell + 3-tile KPI row (total / registered / unregistered). Discipline + status filter chips above the existing card grid; discipline inferred from sheet-number prefix heuristic (no first-class discipline field on the list payload).

## Memory entries written during the run

Six new entries lock in the design principles surfaced during user feedback:

1. **`feedback-count-up-and-cross-filter-recompute-is-the-signature.md`** — `useCountUp` + filter-mutation-driven recompute is the signature interaction. Every numeric tile on every surface uses it.
2. **`feedback-types-page-hero-too-tall.md`** — even the bar surface scaled components bigger than they earn; apply 40-30-20-10 literally; shrink hero on every lifted surface.
3. **`materials-dash-as-knowledge-hub.md`** — Materials is a smart dashboard with QTO + cost + product mapping + LCA as primary axes; reject Materials/Sets toggle; family is a filter facet; leave headroom for future LCA + procurement modules; sandwich-stack for layered + treemap/donut for mixed; 3D PBR sphere preview (Twinmotion/Blender style).
4. **`feedback-treemaps-must-be-squarish.md`** — treemap aspect 1:1 to 4:3; full-width-short treemaps are stacked bars in disguise; ship the bar instead.

Plus updates to `frontend-design-system.md` (corrected the design-guide filename: `dashboard-design-playful-professional.md`, not `frontend-design-guide.md` which never landed).

## Live deploy verification

- Vercel: `https://www.sprucelab.io/` returning 200; bundle hash advanced through 8 deploys.
- Railway: `https://sprucelab-production.up.railway.app/api/capabilities/` healthy throughout.
- Each session's commit triggered a fresh Vercel build before the next session was launched.

## What's parked (intentional)

The audit's "what to keep as-is" + parked items still apply:

- **Backend work**: `entity_ifc_type` field on `IFCType` (Bug 1 long-term fix); `unit_cost` + `gwp_per_unit` on `Material`; IDS XML export endpoint; per-document classification status; drawings `discipline` field; claim `assignee` field; claim bulk endpoints. All would let the existing UI light up automatically — every "amber em-dash + TODO" comment in the frontend marks one.
- **Viewer perf**: still parked per memory. The transparent-background and lazy-mount-concurrency fixes were UX, not perf. AO, DPR, MSAA escape hatches and AnalysisDashboard viewer integration remain queued.
- **Inbox issues per tier** in the EIR builder (referenced in audit §3.8 but not in the 6 explicit MOVES); Phase 7 Claims integration.
- **Onboarding-issue dispatcher** per `iso19650-tiers-and-role-onboarding.md` — needs the backend automation app.
- **BEP-builder route** at `/projects/:id/bep` — needs Phase 7 backend restore from `archive/` per `bep-eir-archive-restore-plan.md`.
- **Site environment in 3D viewer** (cached Kartverket tile + extruded OSM footprints) per `site-environment-architecture.md`.

## Notes

- All 8 sessions ran in isolated git worktrees with hard file-scope walls. Despite three different agents leaking writes to the main-repo path mid-run, the leakage-check step caught it every time and the recovery (stash → apply to worktree → drop) was clean. The "verify pwd before edit" rule should be added to every future agent prompt.
- The mid-flight pivots (Materials reframe Session 4 → 4.5, ModelCard fix between 2 and 3) cost ~one session each but landed exactly what the user wanted. Better to redirect than to ship the wrong thing fully.
- The stale `.claude/worktrees/agent-*` directories now total ~35 (24 stale from prior sessions + ~10 from this run). Cleanup is a separate task — memory rule says never `rm` without explicit user OK. Use `git worktree remove --force` + `gio trash` when the user signs off.
- The audit document at `docs/plans/2026-05-12-15-44_Unified-UX-Audit-and-Redesign-Plan.md` is the artifact future sessions should anchor on for design principles; the sessions in §6 are now all green except for the post-launch polish notes in each section's "Anti-patterns" sub-bullets.

## Next

There's no obvious next "session 9" — the roadmap is complete. The user's directional moves from here:

1. **Live QA**: walk every surface on `https://www.sprucelab.io` with a real project; flag any regression or any place the design language still feels off. The user is the only person who can do this honestly.
2. **Backend lights-up**: any of the parked backend items (cost, GWP, classified-doc status, discipline, claim assignee/bulk) would make the existing UI surface real numbers instead of em-dashes. Pick one per session; each is small.
3. **Materials Lens** — the Lens decision in Session 4 was to DROP rather than move (lift > value). If the user wants the Lens back on Materials, it's a separate small session.
4. **Sidebar polish**: `cmd+B` icon-rail shipped as the stretch; could refine (animations, tooltip placement) if it feels rough.
5. **Worktree cleanup**: ~35 stale dirs; user-approved batch delete when ready.
