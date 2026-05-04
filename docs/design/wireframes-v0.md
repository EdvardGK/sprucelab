# Wireframes — Sprucelab dashboards subsystem (Skiplum first consumer)

ASCII wireframes for the dashboards subsystem proposed in #1, aligned with the
plan docs landed on `main`:

- `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md`
- `docs/plans/2026-05-03-21-30_ISO19650-Framework.md`

And the edkjo response to omarchy's open questions:

- `docs/plans/2026-05-04-02-00_Embed-Open-Questions-Edkjo-Pass.md`

> **Status**: v0.2 — rewritten around omarchy's cross-filter / tile model.
> v0.1's "page per data type" structure was the wrong frame. Dashboards are
> now single cross-filtering surfaces composed of tiles, with the 3D viewer
> as one of the tiles. v0 and v0.1 are in git history.

---

## What changed from v0.1

| v0.1 (now wrong) | v0.2 (aligned with omarchy's plans) |
|---|---|
| Models / Types / Materials / Floors as separate pages | One dashboard surface; those are tile compositions on it |
| Sidebar `Data` section lists 5 routes | Sidebar `Dashboards` section lists 3 pre-built dashboards |
| BIM-krav block on Project Overview | Requirements Fulfillment is the primary dashboard, replacing Overview |
| Quality issues as `health_score` failures | Quality tiles nested inside the requirements they violate; `health_score` retired |
| Model Workspace as a dedicated page with viewer pinned right | ViewerTile cross-filters with chart tiles on the same surface |
| No filter UI in the layout | Filter chip strip + highlight/filter mode toggle in dashboard header |

The ISO 19650 framework plan reframes the metric — "X of Y EIRs fulfilled"
replaces `health_score`. The embed plan makes cross-filter the interaction
model. v0.2 reflects both.

---

## 1. Hierarchy

Unchanged from v0.1: **Company → Project → Scope → Dashboard surface**.

Scope (`apps.projects.ProjectScope`, already shipped) is a tree of spatial
groupings (project / building / wing / floor / zone / custom). Every dashboard
surface is rooted in either a project or a scope; the filter context carries
`project_id` (always) plus optional `scope_id`.

```
Company           Project           Scope (tree, existing)     Dashboards (tile compositions)
NEW               EXISTS            EXISTS                     NEW (3 MVP)
─────────         ──────────────    ────────────────────       ────────────────────────────
Magna             Grønland 55       G55 (root)                 1. Requirements Fulfillment
                                                                2. Type Browser
Vedal             Landbrukskvartalet  ├ Bygg ABD (building)    3. Floors Overview
                                       ├ Bygg C  (building)
Fokus Rådg.        Henrik Ibsens 90    │  ├ Etg 1 (floor)
                                       │  ├ Etg 2 (floor)
Skiplum (intern.)  Kistefos             ├ Bygg E  (building)
                                        └ ...
```

### URL structure

```
/                                              ProjectsGallery, filtered to user's company
/companies/<co>/                               NEW — company landing
/projects/<id>/                                ProjectDashboard — defaults to Requirements
/projects/<id>/dashboards/requirements         Requirements Fulfillment surface
/projects/<id>/dashboards/types                Type Browser surface
/projects/<id>/dashboards/floors               Floors Overview surface
/projects/<id>/dashboards/<id>?scope=<sid>     same dashboards filtered to a scope
/projects/<id>/dashboards/<id>?<filters>       same dashboards with filter context in URL
/projects/<id>/models/<model-id>/              EXISTS — single-model workspace
/projects/<id>/viewer/<group-id>               EXISTS — federated viewer (no chrome)
/embed/dashboards/<dashboard-id>?token=<t>     NEW — chromeless dashboard for iframe consumers
```

The filter context lives in the URL querystring. Bookmarking + sharing a
filtered view = sharing the URL. (See §9 cross-filter interaction.)

---

## 2. Sidebar

Same structure as v0.1, with `Data` collapsed into `Dashboards`:

```
┌─────────────────────────┐
│ [SF] Spruce Forge   🏠  │  ← Skiplum-flavor when host = site.skiplum.no
├─────────────────────────┤
│ 🔍  Søk         [+]     │
├─────────────────────────┤
│ FIRMA              ▾    │  ← only when user has Company FK
│   Magna              ●  │
├─────────────────────────┤
│ Grønland 55             │  ← existing project label
│                         │
│ ▾ Omfang                │  ← ProjectScope tree (existing data, new UI)
│   ▢ Hele prosjektet     │
│   ▾ Bygg ABD            │
│      ▢ Etg 1            │
│      ▢ Etg 2            │
│   ▢ Bygg C              │
│                         │
│ DASHBOARDS              │
│ ✓ Krav-oppfyllelse  ●   │  ← Requirements Fulfillment (default landing)
│ 📋 Typer                │  ← Type Browser
│ 🏢 Etasjer              │  ← Floors Overview
│                         │
│ MER                     │  ← collapsed by default
│ 📦 Modeller             │  ← still navigable (existing ProjectModels)
│ 🧱 Materialer           │
│ 📐 Tegninger            │
│ 🔍 Workbench (intern)   │
│ ✅ Felt    (intern)     │
│                         │
├─────────────────────────┤
│ NO | EN                 │
│ user@…    ↗ Logg ut     │
└─────────────────────────┘
```

The three MVP dashboards (Requirements / Types / Floors) are first-class.
`Modeller`, `Materialer`, etc. stay reachable but de-emphasized — they're
navigation-only and will get rebuilt as tile compositions over time.

---

## 3. Auth flow

Unchanged from v0.1. Existing `Login.tsx` + `AuthCallback.tsx` already cover
this. Skiplum-flavor copy adjustments only.

(See v0.1 history for the auth wireframes; not duplicated here.)

---

## 4. Home + company landing

Unchanged from v0.1. Existing `ProjectsGallery.tsx` filters to user's company;
new `pages/CompanyLanding.tsx` adds a per-company landing with project cards.

---

## 5. Universal dashboard surface

Every dashboard (Requirements / Types / Floors) shares this layout. Tiles are
composed inside the same `DashboardFilterProvider`; clicking a tile updates
the filter context, all other tiles re-project.

```
┌─────────────────────┬──────────────────────────────────────────────────────┐
│ [SIDEBAR]           │  Magna ▸ Grønland 55 ▸ Krav-oppfyllelse              │
│                     │  ┌────────────────────────────────────────────────┐ │
│  Magna              │  │ FILTER:                                        │ │
│  Grønland 55        │  │  [Bygg ABD ✕]  [IfcWall ✕]  [Etg 03 ✕]  +Add  │ │  ← chip strip
│                     │  │                                                │ │
│  ▾ Omfang           │  │  Modus: ◉ Marker  ◯ Filter   [Tøm filter]      │ │  ← mode toggle
│   ▢ Hele prosj.     │  └────────────────────────────────────────────────┘ │
│   ▣ Bygg ABD ●      │                                                      │
│   ▢ Bygg C          │  ┌──────────┬──────────┬────────────────────────────┐│
│                     │  │ Tile A   │ Tile B   │   Tile C (ViewerTile)      ││
│  DASHBOARDS         │  │ MetricC. │ Coverage │                            ││
│  ✓ Krav ●           │  │          │ bars     │  [3D viewer w/ isolation   ││
│  📋 Typer           │  ├──────────┼──────────┤   on filter context]       ││
│  🏢 Etasjer         │  │ Tile D   │ Tile E   │                            ││
│                     │  │ Type     │ Floor    │  [⛶][▣][✂][👁][🎨]        ││
│                     │  │ dist.    │ dist.    │                            ││
│                     │  └──────────┴──────────┴────────────────────────────┘│
│                     │                                                      │
└─────────────────────┴──────────────────────────────────────────────────────┘
```

Common chrome:

- **Breadcrumb**: Company ▸ Project ▸ Dashboard. Active scope appended when
  filter has `scope_id`.
- **Filter chip strip**: every active filter rendered as a removable chip.
  `+Add` opens a popover for picking new dimensions. Chips are labelled with
  the filter dimension and value (e.g. `Bygg ABD`, `IfcWall`, `MMI ≥ 350`).
- **Mode toggle**: `Marker` (highlight — non-selected ghost-dimmed) /
  `Filter` (non-selected removed entirely). Per omarchy plan §Highlight-vs-filter.
- **Clear filter**: empties everything except `project_id` (and `scope_id` if
  set in URL).
- **Tile grid**: CSS grid `repeat(auto-fill, minmax(<min-px>, 1fr))` for
  responsive layout. Tiles declare their `min_width` via CSS custom prop;
  grid auto-collapses below.

ViewerTile placement: by default occupies a 2×2 cell in the right column.
On narrow viewports (< 600px), hides per Robustness #8 ("degraded mode"); a
small button replaces it ("Åpne i Sprucelab"). Other tiles still render and
cross-filter normally.

---

## 6. Dashboard 1 — Requirements Fulfillment (the primary surface)

Lands at `/projects/<id>/dashboards/requirements`. Default surface for the
project — replaces every `health_score` UI per the ISO 19650 plan.

```
┌─────────────────────┬──────────────────────────────────────────────────────┐
│ [SIDEBAR]           │  Magna ▸ Grønland 55 ▸ Krav-oppfyllelse              │
│                     │  [FILTER chip strip]                                 │
│                     │                                                      │
│                     │  ┌──────────────────────────────────────────────────┐│
│                     │  │ Krav-oppfyllelse                  9 av 13 (69 %)││  ← RequirementFulfillmentSummaryTile
│                     │  │ ─────────────────────────────────                ││
│                     │  │ ▰▰▰▰▰▰▰▱▱  per fulfilled                         ││
│                     │  │ Per status:                                       ││
│                     │  │   ✓ 9 oppfylt   ⚠ 3 delvis   ✗ 1 mangler         ││
│                     │  └──────────────────────────────────────────────────┘│
│                     │                                                      │
│                     │  ┌─────────────────────────────────┬────────────────┐│
│                     │  │ Krav-liste (RequirementListTile)│ ViewerTile     ││
│                     │  │ ─────────────────────────────── │                ││
│                     │  │ EIR-01  ✓  Schema IFC4  10/10   │ [3D scene,     ││
│                     │  │ EIR-02  ✓  Authoring     8/8    │  isolated to   ││
│                     │  │ EIR-03  ⚠  NS3451       6/8    │  current       ││
│                     │  │   ↳  Bygg C: 2 walls untyped    │  filter]       ││
│                     │  │ EIR-04  ✓  Storeys      6/6    │                ││
│                     │  │ EIR-05  ⚠  TFM          4/8    │ Click a wall   ││
│                     │  │   ↳  Bygg E: 4 missing TFM      │ here →         ││
│                     │  │ EIR-06  ✗  Coord. CRS   0/1    │  cross-filter  ││
│                     │  │   ↳  Project basepoint unset    │  to that       ││
│                     │  │ EIR-07  ✓  GUID unique  ✓       │  ifc_class     ││
│                     │  │ ...                              │                ││
│                     │  └─────────────────────────────────┴────────────────┘│
│                     │                                                      │
│                     │  ┌─────────────────────────────────────────────────┐ │
│                     │  │ Avvik (RequirementGapsTile)                     │ │
│                     │  │ ───────────────────────────────                  │ │
│                     │  │  187 vegger uten type-referanse (EIR-03, -07)   │ │  ← clicking row
│                     │  │  12 etasjer uten elevation (EIR-04)             │ │     cross-filters
│                     │  │   3 Pset_WallCommon mangler (EIR-08)            │ │     to that gap
│                     │  │  ...                                             │ │
│                     │  └─────────────────────────────────────────────────┘ │
└─────────────────────┴──────────────────────────────────────────────────────┘
```

Tiles:

- **RequirementFulfillmentSummaryTile** — KPI bar with EIR fulfillment count.
  No `health_score`.
- **RequirementListTile** — every EIR with traffic-light status, fulfilled-of-
  total counts, drill-in. Clicking an EIR row sets the filter context to
  match that requirement's instances + scopes.
- **RequirementGapsTile** — flat list of unmet items across active filters.
  Each row carries the requirement(s) it violates. Clicking → filter the
  rest of the dashboard to that gap (e.g. "187 untyped walls" →
  `quality.untyped + ifc_class=IfcWall`).
- **ViewerTile** — geometry, isolated/highlighted to current filter. Click a
  wall in the scene → filter context gets `type_id=<wall-type>` set; all
  other tiles re-project.

Quality tiles (Untyped / Orphan / Empty / etc.) live INSIDE the requirements
they violate, not as standalone metrics. The expanded EIR-03 row is where
"187 untyped walls" surfaces — it's what makes the requirement unfulfilled.

This is the "bad models are the product" framing: a model is never wrong, it
has gaps against specific requirements. The dashboard narrates that.

---

## 7. Dashboard 2 — Type Browser (cross-filter demo surface)

Lands at `/projects/<id>/dashboards/types`. The existing `TypeBrowser` reframed
as a tile composition. The cross-filter loop ships its first end-to-end demo
here per omarchy plan PR 6.

```
┌─────────────────────┬──────────────────────────────────────────────────────┐
│ [SIDEBAR]           │  Magna ▸ Grønland 55 ▸ Typer                          │
│                     │  [FILTER:  Bygg ABD ✕  IfcWall ✕   +Add ]            │
│                     │                                                      │
│                     │  ┌─────────────────────────────────┬────────────────┐│
│                     │  │ Type-fordeling (TypeDistChart)  │ ViewerTile     ││
│                     │  │ ─────────────────────────────── │                ││
│                     │  │ IfcWall          892 inst       │ [scene shows   ││
│                     │  │ ▰▰▰▰▰▰▰▰▰▰  ●●●  ←active        │  walls only,   ││
│                     │  │ IfcSlab          188 inst       │  rest dimmed   ││
│                     │  │ ▰▰▰▱▱▱▱▱▱▱                       │  (Marker mode) ││
│                     │  │ IfcWindow        281 inst       │                ││
│                     │  │ ▰▰▰▰▱▱▱▱▱▱                       │                ││
│                     │  │ IfcDoor          148 inst       │                ││
│                     │  │ ▰▰▱▱▱▱▱▱▱▱                       │                ││
│                     │  │ IfcCurtainWall   116 inst       │                ││
│                     │  └─────────────────────────────────┴────────────────┘│
│                     │                                                      │
│                     │  ┌──────────────────────────────────────────────────┐│
│                     │  │ Type-detalj (TypeDetailTile, follows selection)  ││
│                     │  │ ──────────────────────────────                    ││
│                     │  │ IfcWall                              892 inst     ││
│                     │  │ NS3451  ▰▰▰▰▰▰▰▰▱▱   83 %    234 / 892            ││
│                     │  │ TFM     ▰▰▰▰▰▰▱▱▱▱   62 %    195 / 892            ││
│                     │  │ MMI     ▰▰▰▰▰▰▰▰▰▱   91 %    811 / 892            ││
│                     │  │ FireRating    92 %     Pset_WallCommon            ││
│                     │  │ LoadBearing   78 %     Pset_WallCommon            ││
│                     │  │ IsExternal   100 %     Pset_WallCommon            ││
│                     │  │  Modeller med denne typen: G55_ARK_main (412), … ││
│                     │  └──────────────────────────────────────────────────┘│
│                     │                                                      │
│                     │  ┌──────────────────────────────────────────────────┐│
│                     │  │ Kvalitet for valgt type (Quality tiles, scoped)  ││
│                     │  │ ───────────────────────────────                   ││
│                     │  │ ☐ Uten type-ref (untyped):     12 /  892          ││
│                     │  │ ☐ Foreldreløs geometri:         3 /  892          ││
│                     │  │ ☐ Mangler Pset_WallCommon:     61 /  892          ││
│                     │  │ Click any →  filter context gains quality.<...>   ││
│                     │  └──────────────────────────────────────────────────┘│
└─────────────────────┴──────────────────────────────────────────────────────┘
```

Cross-filter behavior:

- Click `IfcSlab` row in TypeDistChart → filter context gets `ifc_class=['IfcSlab']`,
  ViewerTile isolates slabs, TypeDetailTile re-projects to slab properties,
  Quality tile re-projects to slab quality issues.
- Click a wall in ViewerTile → filter gets `type_id=<that-wall-type>`, charts
  re-project, TypeDetailTile shows that specific wall type.
- Click `Uten type-ref: 12 / 892` quality row → filter gets
  `quality.untyped=true` AND keeps `ifc_class=IfcWall`; ViewerTile isolates
  the 12 untyped walls.

The classifications row (`NS3451 / TFM / MMI`) is driven by
`ProjectConfig.config.type_coverage` — projects with different coverage
configs see different rows. This is the "not locked into legacy NS3451"
property EdvardGK called out as a Skiplum strength.

---

## 8. Dashboard 3 — Floors Overview

Lands at `/projects/<id>/dashboards/floors`. F-3 work (`canonical_floors` +
`/api/projects/scopes/<id>/floors/`) reframed as a dashboard.

```
┌─────────────────────┬──────────────────────────────────────────────────────┐
│ [SIDEBAR]           │  Magna ▸ Grønland 55 ▸ Etasjer                       │
│                     │  [FILTER:  (none) ]                                  │
│                     │                                                      │
│                     │  ┌──────────────────────────────────┬───────────────┐│
│                     │  │ Etasjer (FloorsTable)            │ ViewerTile    ││
│                     │  │ ─────────────────────────────────│               ││
│                     │  │ Code  Navn       Elevation  Avvik│ [scene with   ││
│                     │  │ K     Kjeller     -3.10 m   ✓    │  active floor ││
│                     │  │ 01    1. etg       0.00 m   ✓    │  highlighted; ││
│                     │  │ 02    2. etg      +3.40 m   ⚠ 1  │  click row →  ││
│                     │  │ 03    3. etg      +6.80 m   ⚠ 2  │  isolate floor]││
│                     │  │ 04    4. etg     +10.20 m   ✓    │               ││
│                     │  │  Tolerance: 0.20 m (per scope)   │               ││
│                     │  └──────────────────────────────────┴───────────────┘│
│                     │                                                      │
│                     │  ┌──────────────────────────────────────────────────┐│
│                     │  │ Avvik (FloorDeviationsTile)                       ││
│                     │  │ ─────────────────                                  ││
│                     │  │ G55_ARK_main:  "Etasje 02" foreslått ved +3.46 m  ││
│                     │  │   → kanonisk: 02 (+3.40 m), avvik 0.06 m  ✓ match ││
│                     │  │ G55_RIB_main:  "PLAN 03" foreslått ved +6.92 m    ││
│                     │  │   → kanonisk: 03 (+6.80 m), avvik 0.12 m  ⚠ rename││
│                     │  │ G55_BIMK_fasade:  "Etasje 03" ved +6.81 m  ✓      ││
│                     │  └──────────────────────────────────────────────────┘│
│                     │                                                      │
│                     │  ┌──────────────────────────────────────────────────┐│
│                     │  │ Verifikasjon-gates (existing F-3 editor, reused) ││
│                     │  │  [☑] Block on storey deviation                   ││
│                     │  │   Tolerance: [0.20] m                             ││
│                     │  └──────────────────────────────────────────────────┘│
└─────────────────────┴──────────────────────────────────────────────────────┘
```

Tiles:

- **FloorsTable** — canonical floors per scope, with deviation-count badges.
  Click row → filter gets `floor_code=[<code>]`, ViewerTile isolates that
  floor across all loaded models.
- **ViewerTile** — federated across the scope, with `floorAliases` resolution
  per F-3 (canonical code → list of per-model storey names → hide/show).
- **FloorDeviationsTile** — per-model deviations with severity badges, lifted
  from the existing `ProjectFloorsTab` content. Click a deviation → filter
  to that model + floor for triage.
- **Verification-gates editor** — preserved from the F-3 work. Lives at the
  bottom for staff users; hidden for client tenants (gated by role).

This dashboard demonstrates that the cross-filter model handles spatial
selections (floor) the same way it handles type selections (IfcClass) — same
filter context, same provider, same ViewerTile.

---

## 9. Cross-filter interaction — worked example

Showing what "click in any tile, all tiles re-project" actually feels like.
Starts on Type Browser, filter empty.

```
Step 1: User clicks "IfcSlab" in TypeDistChart.

Filter context changes:        URL becomes:
{                              /projects/g55/dashboards/types
  project_id: "g55",      →      ?ifc_class=IfcSlab
  ifc_class: ["IfcSlab"]
}

What re-projects:
  - TypeDistChart: bar for IfcSlab gets active state
  - TypeDetailTile: switches to IfcSlab properties
  - Quality tile: switches to IfcSlab quality issues
  - ViewerTile: dispatches GET /api/embed/instances?project_id=g55&ifc_class=IfcSlab
                receives express_ids list, isolates slabs in scene


Step 2: User clicks a slab in ViewerTile.

Filter context changes:        URL becomes:
{                              /projects/g55/dashboards/types
  project_id: "g55",      →      ?ifc_class=IfcSlab
  ifc_class: ["IfcSlab"],          &type_id=8b3c2a1f-...
  type_id: ["8b3c2a1f-..."]
}

What re-projects:
  - TypeDistChart: hands off active highlight to that specific type
  - TypeDetailTile: switches to that exact type (e.g. "Hulldekke 265")
  - Quality tile: switches to that type's quality issues
  - ViewerTile: re-isolates to instances of just that type
  - URL is shareable — paste in another browser, you land on the same view


Step 3: User flips Mode from Marker to Filter.

Filter context changes:
{
  ...,
  mode: "filter"
}

What re-projects:
  - All tiles: count rows by current filter, but now hide non-matching
    rows entirely (not just dim/ghost). E.g. the type-distribution chart
    drops every IfcClass except IfcSlab from view. The viewer hides
    everything except the selected type.
```

The viewer does NOT know about charts; charts do NOT know about geometry.
Both speak the same `FilterContext` vocabulary via `useFilterContext()` /
`setFilter()`. The provider holds the URL-sync invariant.

---

## 10. Embed variants

Two new chromeless surfaces hosted at `embed.sprucelab.io`:

### 10a. Embed dashboard (`/embed/dashboards/<dashboard-id>?token=<t>`)

```
┌─────────────────────────────────────────────────────────┐
│ Magna ▸ Grønland 55 ▸ Krav-oppfyllelse                  │  ← minimal header
│ [FILTER chip strip]   [Mode toggle]                     │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  [Same tile composition as §6 / §7 / §8,                │
│   but no sidebar, no nav]                               │
│                                                         │
│  Powered by Sprucelab · sprucelab.io                    │
└─────────────────────────────────────────────────────────┘
```

Token-scoped access. Iframed by skiplum-pages or any allowed origin.
postMessage handshake per omarchy embed plan §Embed-mechanism.

### 10b. Embed viewer (`/embed/viewer/<token>`)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                                                         │
│              UnifiedBIMViewer (chromeless)              │
│                                                         │
│                                                         │
│  [⛶] [▣ fit] [✂ section] [👁 isolate] [🎨]             │
└─────────────────────────────────────────────────────────┘
```

For consumers that just want the viewer, not the dashboard. Token carries
default isolation, color-by, allowed `frame-ancestors`.

---

## 11. Mobile / responsive

Per Q7 of the open-questions doc — design for it now, ship for it later.

Tiles are responsive via CSS Grid `auto-fill, minmax(<min-px>, 1fr)`. Tile
declares its `min_width`; grid auto-stacks below.

Below ~600px wide:

```
┌─────────────────────────┐
│ [≡] Magna ▸ Grønland 55 │  ← hamburger, breadcrumb truncated
│ [Krav-oppfyllelse ▾]    │  ← active dashboard as dropdown
│ [Bygg ABD ✕] [+filter] │  ← chips wrap; collapse to "+3 more" past 3
├─────────────────────────┤
│ Krav-oppfyllelse        │
│ 9 av 13 (69 %)          │
│ ▰▰▰▰▰▰▰▱▱               │
├─────────────────────────┤
│ EIR-01 ✓ Schema  10/10  │  ← list tile, single column
│ EIR-02 ✓ Auth     8/8   │
│ EIR-03 ⚠ NS3451   6/8   │
│ ...                     │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ Åpne 3D-visning     │ │  ← ViewerTile hidden,
│ │  (krever skjerm     │ │     deep-link to full UI
│ │   600 px+)          │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Robustness #8 (degraded mode without the viewer) is exactly this. Non-3D tiles
keep cross-filtering normally on mobile.

---

## 12. Net-new — consolidated punchlist

(Same items as v0.1 §12, refined now that omarchy's plans are in scope.)

Backend:

- [ ] `apps/companies/Company` model, ViewSet, serializer, admin
- [ ] `Project.company` nullable FK; `UserProfile.company` nullable FK
- [ ] `ProjectUser` M2M with role for finer ACL
- [ ] `apps/embed/EmbedToken` model + `EmbedViewSet` + HMAC token utils
- [ ] `apps/embed/views.py /api/embed/instances` resolver (semantic→concrete express IDs)
- [ ] `apps/embed/views.py /api/embed/capabilities` advertisement endpoint
- [ ] Per-request `Content-Security-Policy: frame-ancestors` middleware for `/embed/...`
- [ ] `apps/quality/ModelQualityIssue` model — see Q9 in open-questions doc
- [ ] `apps/projects/views.py /api/projects/<id>/requirements/` reading EIR fulfillment
- [ ] One-off ETL importer: `dalux-ifc-copy.json` → `Project` + `ProjectScope` + `ProjectConfig` rows for Skiplum's 8 projects
- [ ] InformationRequirement + RequirementFulfillment + BEPSection models per the ISO 19650 plan (prerequisite for the Requirements dashboard)

Frontend:

- [ ] `pages/CompanyLanding.tsx`
- [ ] `pages/embed/Dashboard.tsx`, `pages/embed/Viewer.tsx` (chromeless mounts)
- [ ] `Sidebar.tsx`: Firma section + Omfang scope-tree section + Dashboards section
- [ ] `components/dashboard-primitives/`: `MetricCard`, `KPIRow`, `CoverageBar`, `TrafficLightBadge`, `DisciplineRow`, `Sidebar.NavSection` — lifted from skiplum-pages per Q1
- [ ] `contexts/DashboardFilterProvider.tsx` + `hooks/useFilterContext.ts` per omarchy plan PR 2
- [ ] `lib/filter-url-codec.ts` — alphabetized JSON encode/decode for URL serialization
- [ ] Tiles: `ViewerTile`, `TypeDistChart`, `TypeDetailTile`, `RequirementFulfillmentSummaryTile`, `RequirementListTile`, `RequirementGapsTile`, `FloorsTable`, `FloorDeviationsTile`, `QualityIssuesTile`
- [ ] `pages/dashboards/Requirements.tsx`, `pages/dashboards/Types.tsx`, `pages/dashboards/Floors.tsx`
- [ ] Skiplum-flavor theme tokens (CSS vars) keyed to host

CLI:

- [ ] `spruce embed pass {create,list,revoke,refresh}` per Q3
- [ ] `spruce dashboards build --project <slug> --out <dir>` (static export, Track A.5; defer until embed POC ships and we see whether static export is still desired)

Infra:

- [ ] Custom domain `site.skiplum.no` on existing sprucelab Vercel project
- [ ] `embed.sprucelab.io` subdomain for chromeless embed routes
- [ ] Theme switch keyed off `Host` header
- [ ] Custom SMTP in Supabase for NB email deliverability

---

## 13. Open questions (this draft)

Things omarchy's open-questions doc surfaced that need follow-up here:

1. **Static HTML export vs. live embed**: with iframe + cross-filter as the
   product, static export becomes a different product (no cross-filter, no
   live data). Worth keeping? Skiplum-pages is currently static; if the embed
   replaces it, static export is moot. Lean toward dropping static export
   from the plan unless a customer explicitly asks for offline/PDF.
2. **Dashboard authoring**: tiles are React components in this repo. How do
   non-developer staff (Skiplum project lead) author a new project's dashboard
   if it's just code? For v1 the answer is "the same dashboards on every
   project, configured via ProjectConfig"; long-term might want a tile-config
   layer. Out of v0.2 scope; flag for post-MVP.
3. **Sidebar navigation when scope is active**: current draft shows the scope
   tree always expanded. Omarchy plan implies scope is a filter dimension, not
   a nav target — so scope tree maybe BELONGS in the chip strip, not the
   sidebar? Or both — sidebar for selection, chip for current state? Lean
   toward both, tested with users.
4. **`/projects/<id>/` default**: should it be the Requirements dashboard
   (default useful surface) or stay the existing Overview tab (back-compat)?
   v0.2 picks Requirements. Existing in-app users get a different default
   than today; embed users see Requirements first regardless.

---

## Out of scope (v0.2)

- Authoring UI for EIRs, BEPs, and `ProjectConfig.config.type_coverage`
  (these are config artifacts that the ISO 19650 plan addresses elsewhere)
- Notifications / activity feeds
- Comments / collaboration
- Per-element annotation
- Dark mode
