# Unified UI/UX Audit + Redesign Plan

**Date**: 2026-05-12 15:44
**Author**: Audit pass following the four-track lift (commit `e2dec7a`)
**Trigger**: User feedback — "Types page is currently the best we have." Four other surfaces are still visibly off the bar.

The four-track lift on 2026-05-12 shipped infrastructure (`DashboardTile` wrappers, KPI clusters, `useCountUp`, `Sparkline`, tone rings) across Materials, Project dashboard, Model dashboard, and the EIR builder polish. The primitives reached every surface; the *design language* — the thing that makes Types v2 feel right — did not. This audit reads the actual code, lines up each surface against the Types v2 bar, and proposes a sequenced repair plan.

---

## 1. Where we are

| # | Surface | Status | One-line read |
|---|---------|--------|---------------|
| 1 | Global shell (Sidebar / AppLayout) | LAGGING | Sidebar has 8 chunky sections, uppercase shouting labels, glass-on-page chrome — none of the Linear pillars |
| 2 | Projects gallery | LAGGING | Generic `<Card>` grid, `container mx-auto` cap, `hover:shadow-glow` — different aesthetic than the rest of the app |
| 3 | Project Dashboard | CLOSE | Lifted to DashboardTile, but viewport-lock pattern leaks (`min-h-[calc(100vh-4rem)]`) and the Tabs nesting (Overview/Models/BIM/Floors) competes with the sidebar nav |
| 4 | IFC Models page (`ProjectModels.tsx`) | LAGGING | Fixed `h-44` cards, three big columns, no model preview, no project-level KPIs, table-view has eight columns of stale data |
| 5 | Per-model workspace ("Model dash") | BROKEN + CLOSE | Track C lift visible, but the **header + `overflow-hidden` shell clip the page**, so on a 27" the bottom half is dead space — see Bug 2 |
| 6 | Types page (`ProjectTypesPage` + warehouse-v2) | BAR | The reference. Headline + gradient strip + KPI cluster + treemap/viewer/rail + Top-10/table |
| 7 | Materials library | CLOSE | Lifted to KPI header + treemap + 3-column layout — but the center column is dense and the right detail panel is busy without a hero affordance |
| 8 | Project Config / EIR builder | LAGGING | Functionally rich (drag-drop, tier-filter, mode toggle, preview panel) but visually a wall of small palette + dense rule cards. "Legit horrible" per user |
| 9 | Claims / Documents / Drawings | CLOSE | Phase 2 shipped real pages, but they were never touched by the four-track lift. No KPI header, no gradient accent, no consistent layout primitive |
| 10 | 3D viewer (FederatedViewer / UnifiedBIMViewer) | LAGGING (parked) | Memory says viewer perf is parked. UX gaps real: HUD chips inconsistent across pages, no project-level scope display, isolation prop unclear at the user's mental model |

Two surfaces meet the BAR. Five are CLOSE. The rest are LAGGING. One bug actively breaks Model dash on the user's primary 27" viewport.

---

## 2. The design language (the bar)

Distilled from `TypeBrowserV2` + the four anchored memory entries (Linear, cross-filter, modelers-own-data, viewport targets).

**Page chrome**
- 3px gradient strip `from-[#D0D34D] via-[#157954] to-[#21263A]` at top of content. Shipped on Types + Materials + ProjectSettings; missing on the other seven.
- Header: `h1` at `text-[clamp(1rem,1.6vw,1.5rem)]` + subtitle. No giant `text-4xl` (ProjectModels + ProjectsGallery violate).
- Padding `px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.75rem,1.5vh,1.25rem)]`. Never `container mx-auto` or `max-w-7xl`.

**Layout**
- Page scrolls naturally. NO `h-[calc(100vh-X)] overflow-hidden` shells. Bounded scroll lives inside cards (`max-h-[640px]` on the Types table is the pattern).
- Cards: `<DashboardTile>` for KPI/viz, plain `<Card>` otherwise. No fixed `h-[220px]` outside KPI rows — use `min-h-[clamp(...)] flex-1` so cards grow at 27".
- `<DashboardGrid>` above-the-fold; flow below. Don't mix grid-and-flow on one row.

**Numbers + data**
- `tabular-nums` everywhere. Gap KPIs get tone rings (warn/danger thresholds). KPI tiles always get a sparkline footer. Missing values render as amber `—`, never "Mapped 0%".

**Cross-filter (PowerBI)**
- Click chart/chip/bar → `useProjectFilterActions` mutation. Modal access via `<Table2>` in card header (`onViewData`), never as the primary click target. Filter store lives once on `<ProjectShell>`; no page-local filter `useState`.

**Density**
- Headline `text-[clamp(1.5rem,4vw,2rem)]` · body `text-[clamp(0.625rem,1.2vw,0.75rem)]` · KPI labels `text-[clamp(0.5rem,1vw,0.625rem)] uppercase tracking-[0.06em]` · icons `h-[clamp(1rem,2vw,1.25rem)]` · tile padding `p-[clamp(0.5rem,1.5vw,1rem)]`.
- Two viewport targets: 1440×900 laptop + 2560×1440 27". 27" fills horizontal with denser grids, not bigger gaps.

**Linear pillars (anti-patterns)**
- Tactical workspaces use two-pane (list ↔ detail), never modal-only. Sidebar quiet (no uppercase shouting, no glass on page chrome — glass is for in-viewer HUDs). Compose, don't reflow. No glow, no hover-shadow-glow.

---

## 3. Surface-by-surface redesign briefs

### 3.1 Global shell (Sidebar + AppLayout)

**Current** (`Sidebar.tsx:60`): `bg-white/60 backdrop-blur-xl` glass, 8 sections in `text-xs font-semibold uppercase tracking-wider`, fixed `w-64`. Active state is a heavy `bg-primary/10` slab. Project-context shows a completely different section tree than non-project — sidebar structure flips on navigation.

**Target (Linear Pillar 2)**:
- Opaque (`bg-card`), no glass — glass is for in-viewer HUDs per `viewer-architecture.md`.
- Single-case section labels (`text-[0.7rem] text-text-tertiary`), no uppercase shouting.
- Subtle active state: `text-primary font-medium` only, no background pill.
- Help/language/user/sign-out collapse into one bottom-menu icon.
- `cmd+B` collapse → icon-rail (stretch).
- Stable tree across in-/out-of-project — only items toggle, section labels don't restructure.

**Files**: `Sidebar.tsx` rewrite. Don't touch AppLayout. Anti-pattern: don't lift Linear's purple gradients — we have the skiplum forest/lime/navy palette.

### 3.2 Projects gallery

**Current** (`ProjectsGallery.tsx:48-128`): `container mx-auto p-6` (violates no-cap rule), `text-3xl font-bold`, `hover:shadow-glow` cards. Cards show only name + model count + dates. No KPIs, no thumbnails.

**Target**:
- Drop `container mx-auto`. Use clamp padding. Gradient strip + clamp header.
- KPI row top: total projects · models · types · instances · storage. 5 `<DashboardTile>`s.
- Cards `h-[180px]` `minmax(280px,1fr)`. Add KPI strip (models · types · last activity) + IFC class sparkbar.
- Sort/filter chips above the grid. `hover:border-primary/40`, not `hover:shadow-glow`.

**Files**: `ProjectsGallery.tsx` + new `useProjectsKpis` (or reuse `useDashboardMetrics`).

**Anti-pattern**: no 3D thumbnails per card (WebGL context limit). Static thumbnail via backend later.

### 3.3 Project Dashboard

**Current**: Track B lift wrapped tiles correctly (`ProjectDashboard.tsx:187-197`), but `min-h-[calc(100vh-4rem)] p-6` (line 121) leaks viewport math and the inner `<Tabs>` triad (Overview/Models/BIM/Floors) duplicates sidebar nav. The `BIM` tab embeds the legacy `<TypeDashboard>` — a different surface than `/types`.

**Target**:
- One scrolling page, no inner Tabs. `BIM` content folds into `HealthSignalsTile` + drill-link. `Models` is the sidebar's `/models` route. `Floors` moves to `/projects/:id/floors` (new sibling route in sidebar).
- Drop `Back to projects` button — sidebar owns nav.
- Apply PageShell chrome (§5).
- Laptop: 4 KPIs + Health + Attention row 1. 27": row 1 stays + Discipline + Recent on row 2 side-by-side; below scrolls into deeper activity feed and the (later) EIR fulfillment ribbon.

**Files**: `ProjectDashboard.tsx` (drop Tabs + viewport lock), `Sidebar.tsx` (add Floors).

### 3.4 IFC Models page

> User verbatim: "More info/tactical model cards and some overall stats. Also the cards are just too big for their content. I actually want a miniature viewer on each model card."

**Current** (`ProjectModels.tsx`): `text-4xl font-bold` headline (line 152), `h-44 p-5` cards with name/version/status/elements/storeys/mapping/dates but no thumbnail and no IFC distribution. 9-column table view duplicates the card data. Mapping uses the rejected "X/Y types" framing (lines 265-282).

**Target — KPI row + viewer-per-card**:
- Project-level KPI row above the list: Total models · Total elements · Total storeys · Total file size · Avg processing time · Latest upload. `<DashboardGrid>` with 6 tiles, sparkline footer per KPI (elements-per-model distribution etc.).
- Card shape `h-[clamp(220px,28vh,260px)]`, `grid-cols-[180px_1fr]`. Left column = mini viewer `<InlineViewer modelId={...} className="h-[180px] w-[180px]" />` lazy-mounted via IntersectionObserver, `?ao=off&dpr=1&msaa=0`, cap 8 concurrent (WebGL context limit ~16). Right column = name + version + status + tiny KPI strip + `TypeTopBarList` of top-3 IFC classes (`h-[44px]`).
- Drop the verbose "Added X / v1 uploaded Y / by Current User" triple → single relative time. Drop the chevron glyph. Drop the table view OR reduce to a 5-col tile.
- Mapping framing: raw `(mapped, total)` tabular with amber em-dash when zero. No percentage bar.

**Files**: `ProjectModels.tsx` rewrite, new `useProjectModelsKpis`, extracted `ModelCard` (currently inline 230-358), new `useLazyViewerMount` (IntersectionObserver). Reuse: `<InlineViewer>` (full-model branch already at lines 161-180), `<DashboardTile>`/`<DashboardGrid>`, `useCountUp`, `<Sparkline>`, `TypeTopBarList`.

### 3.5 Per-model workspace ("Model dash")

> User verbatim: "Not using the viewport, but has some kind of fixed height that leaves the bottom half my 27 inch blank."

**Diagnosis (Bug 2)** (`ModelWorkspace.tsx`):
- Line 79: outer `<div className="flex flex-col h-full overflow-hidden">` clips to viewport.
- Line 149: tab content `flex-1 min-h-0 overflow-y-auto` makes the inner div the scroll container.
- Cards inside `OverviewTab` use fixed `h-[220px]` (547) and `h-[280px]` (557). Total content ~700px against 1300px available on 27" → ~600px of dead grey at the bottom.

**Fix**:
- Line 79: drop `h-full overflow-hidden`.
- Line 149: drop `flex-1 min-h-0 overflow-y-auto` (page scrolls).
- Lines 547/557: fixed heights → `min-h-[clamp(180px,22vh,260px)] flex-1` and `min-h-[clamp(280px,32vh,420px)] flex-1`.
- Viewer + Quality + Geometry rows (lines 578, 663): add `min-h-[clamp(360px,44vh,560px)]` so they grow.
- Add gradient strip + clamp header (currently `text-xl font-semibold`, no strip).
- Drop the redundant header "Quick Stats" row (102-122) — `AnalysisKpiCluster` (line 532) already owns it.
- `<DashboardOverlay>` modals (694-728) stay as Maximize escape; not the primary click target.

**Files**: `ModelWorkspace.tsx` only.

### 3.6 Types page (the bar — but tighten the hero)

What makes it good: gradient strip + clamp header with freshness badge + single-row filter bar + 6-tile KPI grid with tone rings/sparklines/count-up + 2-row above-the-fold + below-the-fold Top-10 + table at 75/25 with internal scroll.

> **User verbatim (post-audit feedback)**: "The one thing I have on the type page is that it might still be a bit too 'big'. Components are scaled bigger than necessary, so that the types table and bar chart get pushed down far for no reason."

**Current hero is too tall** — `TypeBrowserV2.tsx` uses `h-[clamp(560px,calc(100vh-14rem),1100px)]` for the above-fold block. 1100px ceiling is too generous; KPI tiles have ~20% empty top area; treemap and viewer pane both earn less vertical than they take. On 1440×900 laptop, the Top-10 bar chart and types table sit below the fold for no good reason.

**Fix to apply on Types page itself AND on every surface that lifts the pattern**:
- Hero ≤ 40% of viewport per the design guide's 40-30-20-10 rule (currently ~55-65%).
- KPI tile internal padding -20-30%.
- Hero clamp ceiling drops from 1100px to ~720px on 27"; 1440-laptop target = ~520px.
- Table + Top-10 visible without scroll on 1440×900.
- Test both 1440×900 + 2560×1440.

Type-specific: `TypeDataRail`, `TypeTopBarList`, `TypeTreemap`.
Generalizable: page chrome (gradient + clamp header + padding), "viz + viewer + rail" template, "bar + table below the fold" template — but lift the *tightened* hero, not the current bloated one.

**Lift**: a `<PageShell>` component at `frontend/src/components/Layout/PageShell.tsx` (~30 lines) wrapping gradient + clamp header + padding. Every other page imports it.

**The signature interaction (don't dilute when lifting)**: `useCountUp` on every numeric KPI/metric/count tile, re-firing on filter/scope mutation. This is the visible proof that cross-filter is alive — the user explicitly called it out as something they love. When a surface lifts the Types pattern, count-up is not optional; it's the point. Pair with `Sparkline` + `tabular-nums` + tone rings as one bundle, per `feedback-count-up-and-cross-filter-recompute-is-the-signature.md`.

### 3.7 Materials library

> User verbatim: "Very dense. Needs a makeover. Good KPI cards and good ideas, but full makeover from scratch, within the design ideas of the project."

**Current** (`MaterialBrowserView.tsx`): KPI header + gradient strip are good. Filter bar packs four controls in one row (search + materials/sets tabs + LensSwitch + FamilyViewSwitch). Main grid `grid-cols-[clamp(220px,18vw,300px)_1fr_clamp(280px,24vw,380px)]` (line 244) — family tree column + materials table + detail. The tree column duplicates the treemap data.

**Target**:
- Drop the FamilyViewSwitch — treemap is the default; the family tree column goes away. The 220-300px reclaimed widens the table.
- Move LensSwitch from page filter bar into the detail panel — the lens is detail-scoped, not page-scoped.
- Materials/Sets toggle: keep, but move to the right edge of the filter bar (less weight than search).
- Mini viewer in detail panel: `<InlineViewer modelId={...} typeId={...}>` for the first associated type when a material is selected.
- Verify `MaterialDetailTabs` follows modelers-own-data framing — amber em-dash on gaps, no "Mapped %".

**Files**: `MaterialBrowserView.tsx` (reduce filter density, drop tree column), `MaterialDetailTabs.tsx` (add InlineViewer slot, audit gap framing), `MaterialsTable.tsx` (amber em-dash for gaps).

**Anti-pattern**: don't add a 4th sub-filter. Strip down, not add. Don't ship four equal-weight tabs in detail.

### 3.8 Project Config / EIR builder — the BIG one

> User verbatim: "Legit horrible from a UI/UX perspective. Needs a full overhaul. You know the ideas/intent."

**Intent** (from `eir-is-a-rule-builder.md`, `eir-bep-four-surfaces.md`, `iso19650-tiers-and-role-onboarding.md`): composable rule list, palette + sortable workspace, two routes (/eir, /bep) with `?mode=view|edit` gated by role, 15 rule kinds, ISO 19650 tier filter (OIR/AIR/PIR/EIR), rules carry `tier` + `responsibleRole`, preview panel.

**Current** (`ProjectSettingsPage.tsx`): mode toggle + tier control in palette (Track D shipped). Three-column grid palette (14-18rem) + workspace (1fr) + preview (20-28rem) at xl. Outer `flex flex-col h-full overflow-hidden` (line 219) — another viewport lock.

**Why it feels horrible**:
1. The 15-rule palette is a flat list with no hierarchy — every kind looks the same.
2. Rule cards in the workspace are heterogeneous heights (toggle = 40px, address picker = 160px, CRS dropdown = mid) → visual jitter.
3. The preview panel is xl-only. At 1440 laptop you author with no live preview — but preview is where the page comes alive (Kartverket map, IFC cube).
4. View mode = edit mode minus sidebar (jarring, not calming). No "what does this EIR look like as a doc" mode.
5. Drop-zone affordance is weak (line 395) — the empty state doesn't say "drag here" loudly.

**Target — viewer-first document with editor affordances**:
- **VIEWER mode (default everyone)**: renders the EIR as a Notion-style structured document. Tier sections (OIR/AIR/PIR/EIR), each rule as `name · description · value · source`. Calm, scannable, scrollable. This is what gets exported to PDF.
- **EDITOR mode (gated)**: same document layout, but rules gain drag handle + remove X, values become inline-editable on double-click. Palette becomes a popover from a `+ Add rule` button in the header — not a permanent 16rem sidebar. Reclaims horizontal space at 1440 for the preview.
- **Preview panel as tabbed right sidebar at lg+** (not xl-only). Tabs: `Document` (full EIR render), `Map` (Kartverket when site_plan rule present), `3D` (IFC cube when placement+site_plan), `IDS XML` (per `ids-as-interop-format.md`).
- **Tier control moves to page header**. Filters BOTH palette AND workspace (currently only palette). `All / OIR / AIR / PIR / EIR` segmented.
- **Uniform-height rule cards** with internal scroll on overflow. Kills the jitter.
- **Inbox issue link** per tier section: "3 rules assigned to you, unanswered → Open Inbox". Wires the EIR builder to the role-onboarding mechanic.
- Route rename `/settings` → `/eir` per `eir-bep-four-surfaces.md`, back-compat redirect.

**Files**: `ProjectSettingsPage.tsx` rewrite, `EirRuleCard.tsx` (uniform height + scroll), `EirRulePalette.tsx` (collapse to popover), `EirPreviewPanel.tsx` (tabs), new `EirDocumentView.tsx`.

**Anti-patterns**: no fixed-section triad. Palette is a tool, not a tile. No wizard.

### 3.9 Claims / Documents / Drawings

**Current**: Phase 2 (commit `35ed867`) shipped real pages, untouched by the four-track lift. Inconsistent chrome across all three.

**Target**:
- Apply `<PageShell>` (gradient + clamp header + padding) to all three.
- Claims = tactical workspace (Linear Pillar 1): two-pane list+detail, filter chips, inline status edit, bulk action.
- Documents: KPI row (total · with-claims · pending-review · classified) + format-aware card grid (already shipped).
- Drawings: KPI row (total · registered · unregistered) + card grid.

**Files**: `ProjectClaimsPage.tsx`, `ProjectDocuments.tsx`, `ProjectDrawings.tsx`. Reuse Layout primitives.

### 3.10 3D viewer (parked)

Memory says viewer perf is parked. UX gaps noted for Phase 4 only:
- No project-scope indicator in HUD (user sees which classes, not which models).
- HUDScene vs UnifiedBIMViewer confusion when "Show in Model" navigates.
- Filter panel hover-revealed instead of `cmd+F`.

Don't act now.

---

## 4. The two bugs

### Bug 1: Type-dash viewer class-filter doesn't isolate

**Symptom**: On `ProjectTypesPage` `?v=2`, applying a class filter or clicking a treemap tile updates data (KPI/table/top-10) but the embedded viewer shows `ClassFilteredState` placeholder ("Select a single type to isolate in 3D"), not isolation.

**Diagnosis** (`TypeViewerPaneV2.tsx:23-45`): backend extracts TYPE classes (`IfcWallType`) but fragments runtime exposes ENTITY classes (`IfcWall`). The regex mapping is heuristic per `data-extraction-vs-fragments-runtime-mismatch.md`. Memory ranks fixes: (1) add `entity_ifc_type` on `IFCType` model, (2) add `instance_guids[]`, (3) fix viewer first-sync delta at `UnifiedBIMViewer.tsx:1948`.

**Recommended path — frontend-shippable workaround**:
- `/api/types/{id}/instances/` (`backend/apps/entities/views/types.py:440-539`) already returns instance GUIDs per type.
- New hook `useTypesInstancesByClass(modelId, ifcClass)`: collects all `type.id` for matching class, fires parallel `/instances/` requests (limit 6 at a time), unions GUIDs.
- New `guidsOverride?: string[]` prop on `<InlineViewer>` → passes to `UnifiedBIMViewer` as `isolation={{ guids, mode: 'all' }}` per `viewer-architecture.md`.
- Cost: ~20 API calls for a 20-type class. Spinner during union. Then ship `/api/types/instances-by-class/` single-call endpoint in a follow-up. Real fix (entity_ifc_type field) deferred to a backend session.

**Files**: `TypeViewerPaneV2.tsx` (replace `ClassFilteredState` body when class active), `InlineViewer.tsx` (new prop), `use-warehouse.ts` (new hook).

### Bug 2: Model-dash blank bottom half on 27"

**Symptom**: `ModelWorkspace.tsx` OverviewTab content fills ~700px; the remaining ~600px on a 1440-height monitor is dead grey.

**Diagnosis** (covered in §3.5): `h-full overflow-hidden` shell at line 79, inner `overflow-y-auto` at line 149, fixed `h-[220px]/h-[280px]` cards at 547/557.

**Fix**: 5 lines of CSS. Drop the shell, drop the inner scroll, swap fixed heights to `min-h-[clamp(...)]`. Single PR.

---

## 5. Cross-cutting issues (the unified part)

Patterns that appear across MULTIPLE surfaces. These are where a single fix repays itself five times.

### 5.1 Viewport-lock leaks
Violated on: `ModelWorkspace.tsx:79` (Bug 2), `ProjectDashboard.tsx:91,101,121`, `ProjectSettingsPage.tsx:219`.
**Fix**: ship `<PageShell>` (and `<PageShell.Bounded>` for the viewer page only). Lint rule: forbid `h-\[calc\(100vh` in `pages/**/*.tsx` except `FederatedViewer.tsx`.

### 5.2 Inconsistent chrome (gradient strip + header sizing)
Gradient strip on Types/Materials/ProjectSettings; missing on Dashboard/Models/ModelWorkspace/Gallery/Claims/Documents/Drawings/Field. Header sizes: Types `clamp(1rem,1.6vw,1.5rem)` ✓; Dashboard `text-xl` · ModelWorkspace `text-xl` · Gallery `text-3xl` · Models `text-4xl` all wrong.
**Fix**: `<PageShell title subtitle>` renders strip + clamp header. One source of truth.

### 5.3 ProjectFilterProvider partially wired
`<ProjectShell>` mounts it; Dashboard, FederatedViewer, ModelWorkspace consume. TypeBrowserV2 does NOT — it uses local `useState` (`TypeBrowserV2.tsx:33-36`) for `modelId/searchQuery/ifcClassFilter/selectedTypeId`.
**Fix**: migrate `modelId` + `ifcClassFilter` + `selectedTypeId` to `useProjectFilter`. Search stays local. Effect: dashboard discipline click filters Types page; treemap click filters dashboard.

### 5.4 Viewer-mount strategy inconsistent
Types v2 uses `<InlineViewer>`; ModelWorkspace uses `<UnifiedBIMViewer>` directly; ProjectModels has no viewer; Materials has no viewer.
**Fix** (after Bug 1 + ProjectModels redesign): `<InlineViewer>` = canonical embed (lazy, small). `<UnifiedBIMViewer>` = canonical interactive. Both feed `{ guids, mode }`. Add `useLazyViewerMount(ref)` IntersectionObserver hook.

### 5.5 "Mapped %" framing still present
Per `feedback-modelers-own-data-platform-suggests.md`, rejected. Still at `ProjectModels.tsx:265-282` (cards) + `421-437` (table).
**Fix**: raw `mapped/total` tabular, amber em-dash on zero. No bar.

---

## 6. Sequencing recommendation

Eight focused single-track sessions. Each session = one visible PR. No coordinator rounds. Order is from "fixes the most visible breakage / highest user impact" down to "polish".

### Session 1 — Bug fix + PageShell primitive + Types-hero trim [5 hours]
**Scope**: Three small wins in one PR.
- Bug 2: Model-dash viewport unlock (§4 Bug 2 diagnosis — 5-line CSS).
- Extract `<PageShell>` component (gradient + clamp header/subtitle + padding) and retrofit Types, Materials, ProjectSettings to use it.
- Types-hero trim: drop the `h-[clamp(560px,calc(100vh-14rem),1100px)]` ceiling to roughly half; cut KPI tile inner padding 20-30%; verify Top-10 + table sit above the fold on 1440×900. See §3.6 for the rule.
**Outcome**: ModelWorkspace fills the screen. PageShell is the new chrome primitive. The bar surface (Types) feels tighter — table and bar chart visible without scroll. Verifiable on `https://www.sprucelab.io/projects/<id>/models/<modelId>` and `/projects/<id>/types?v=2`.
**Dependencies**: None.

### Session 2 — IFC Models page redesign [6 hours]
**Scope**: ProjectModels.tsx full rewrite. Project-level KPI row. Model cards with mini viewer (`<InlineViewer>` lazy-mounted via IntersectionObserver, cap 8 concurrent). Drop table view OR reduce to 5 columns inside a tile. PageShell chrome.
**Outcome**: The user's #1 request — "mini viewer per model card, more tactical info, smaller cards". Verifiable on `/projects/<id>/models`.
**Dependencies**: Session 1 (PageShell).

### Session 3 — Bug 1 fix (Types-dash viewer class filter) [3 hours]
**Scope**: Frontend workaround — multi-fetch `/api/types/{id}/instances/`, union GUIDs, feed to InlineViewer via new `guidsOverride` prop. Spinner during fetch. New `useTypesInstancesByClass` hook.
**Outcome**: Click treemap tile or class filter → viewer isolates to that class. Bar is restored on the only surface that's already at the bar.
**Dependencies**: None (separate from PageShell).

### Session 4 — Materials makeover [5 hours]
**Scope**: Drop FamilyViewSwitch (treemap default). Demote LensSwitch into detail panel. Replace family tree column with a wider table or move treemap to take its place. Mount InlineViewer in the detail panel's Definition tab. PageShell chrome. Verify amber em-dash on gaps.
**Outcome**: Materials page reads less dense, surfaces the same KPIs, has a viewer in the detail. User flagged this directly.
**Dependencies**: Session 1 (PageShell), Session 3 nice-to-have (the detail viewer uses single-type isolation which works today).

### Session 5 — Project Config / EIR builder overhaul [8 hours, may split]
**Scope**: VIEWER-first redesign. Document layout (sections per tier, rules rendered as `name · description · value · source`). EDITOR mode adds inline edit affordances + `+` popover palette (not permanent sidebar). Right preview tabs (Document / Map / 3D / IDS XML) at lg+. Uniform rule-card heights. Tier control in page header. PageShell chrome. URL rename `/settings` → `/eir` with back-compat redirect.
**Outcome**: "Legit horrible" → "legit good." This is the big one; expect a second session for polish.
**Dependencies**: Session 1 (PageShell).

### Session 6 — Sidebar quiet rewrite (Linear Pillar 2) [4 hours]
**Scope**: Drop glass on sidebar. Single-case section labels. Subtle active state (no slab). Help/language/user/sign-out into one menu. Stable section structure across in-project / out-of-project. `cmd+B` collapse (stretch).
**Outcome**: Quiet sidebar. The whole app feels calmer without the visual competition.
**Dependencies**: None.

### Session 7 — ProjectDashboard cleanup + ProjectsGallery refresh [4 hours]
**Scope**: ProjectDashboard — drop Tabs (Overview / Models / BIM / Floors); make it a single scrolling page. PageShell chrome. Drop viewport-lock leaks. ProjectsGallery — drop `container mx-auto`, drop `hover:shadow-glow`, add KPI row + class-distribution sparklines on each card.
**Outcome**: Two more surfaces at the bar.
**Dependencies**: Session 1 (PageShell).

### Session 8 — Claims / Documents / Drawings consistency pass [3 hours]
**Scope**: Apply PageShell + KPI row to all three. Claims gets two-pane tactical workspace (list left, detail right). Documents + Drawings get KPI strips matching the rest.
**Outcome**: Last three surfaces aligned. App reads consistent end-to-end.
**Dependencies**: Session 1, Session 6 (nice-to-have for Claims tactical pane consistency).

**Total**: 37 hours across 8 sessions. Sessions 1-3 are the highest-impact (fix user's flagged bugs + biggest visible misalignment). Sessions 5 (EIR) and 2 (Models) are the most ambitious. Order can shift but Session 1 must run first (PageShell unblocks downstream sessions).

---

## 7. What I'd KEEP as-is

The pieces that already work and should not be re-touched in this redesign:

- **`<DashboardGrid>` + `<DashboardTile>`** at `frontend/src/components/Layout/`. These are the right primitives; they shipped correctly. Use them more, don't change them.
- **`useCountUp` + `<Sparkline>`** at `frontend/src/components/features/warehouse-v2/`. Correct visual language. Lift to a `components/dashboard/` shared dir per the worklog's note, but keep behavior identical.
- **`<TypeBrowserV2>` page structure** — the reference. Don't refactor its layout. Lift its chrome to `<PageShell>`.
- **`ProjectFilterProvider` + URL sync + persist** — locked in PR 1.1–1.5. Don't add parallel stores.
- **`<UnifiedBIMViewer>` + `<InlineViewer>` split** per memory `viewer-architecture.md`. Don't merge them; both have their job.
- **Track D EIR rule builder primitives** (`EIR_RULES`, `EirRuleDefinition`, `EirRuleCard`, drag-drop infra). The data layer is right; only the presentation needs reshape.
- **Track A material families + treemap component**. Family tree column is the thing to drop; the treemap stays.
- **Kartverket map + IFC cube preview** (Track D). They're correct; they just need a better home (preview tabs).
- **i18n discipline** — every track wrote to its own namespace. Keep doing this.
- **Live deploy verification** (`https://www.sprucelab.io/` + Railway healthcheck) per memory `feedback-tests-only-on-live-site.md`. Don't propose localhost.

---

## 8. Open questions for the user

Kept short — the brief said "You know the ideas/intent."

1. **EIR document export format**: PDF only, or also IDS XML + DOCX? Memory `ids-as-interop-format.md` says IDS is the bidirectional format; do we ship IDS export in Session 5, or defer to Phase 7 backend?
2. **Mini-viewer concurrency cap on the Models page**: 8 concurrent WebGL contexts is conservative. If models are small (<5MB IFC), can we push to 16? Or is the user fine with "8 visible, others render on scroll"?
3. **Mode-toggle gating on `/eir`**: should the editor visibility default to `?mode=view` for everyone (including admins, who can flip to edit), or default to edit for admins? The current Track D implementation defaults to view; `eir-bep-four-surfaces.md` says editors default to edit. Pick one.
4. **Drop the Project Dashboard's BIM tab** (which embeds the old `<TypeDashboard>`): is the user OK with this? It's redundant with `/types` but it's been the "see the legacy v1 dashboard" entry point.

---

**Status**: Plan only. No code changes. No commits. Ready for the user to read, react, and pick a session to start with.
