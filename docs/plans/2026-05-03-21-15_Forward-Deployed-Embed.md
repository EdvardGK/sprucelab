# Forward-Deployed Embeddable Dashboards

**Track:** 2026-Q2 mission (CONTRIBUTING.md §Current mission)
**Status:** Plan — supersedes nothing yet, expects implementation PRs to follow
**Authors:** omarchy session, draft for cross-machine review with the edkjo session

---

## Goal

Sprucelab dashboards rendered inside external pages (first consumer:
**skiplum-pages**, a GitHub Pages site that already does layout/wireframing
work for the Skiplum dashboard family). Hosted by Sprucelab, embedded by
arbitrary websites, behind scoped tokens.

The unit of embedding is a **page**, not a tile — see [Embed mechanism](#embed-mechanism)
below for why.

---

## Interaction model: PowerBI-style cross-filter, with the 3D model as a first-class tile

The interaction model is the product. Every tile on a Sprucelab dashboard —
metric card, chart, table, **and the 3D viewer** — is a projection of the same
filter context. Click `IFCWall` in any tile and:

- Every other tile re-projects to wall-only data.
- The 3D viewer **isolates** wall instances (or **highlights** them, dimming
  the rest — see [Highlight vs filter](#highlight-vs-filter)).

Bidirectional by default: clicking a wall in the 3D scene cross-filters the
tiles back. The viewer is not a separate panel; it's a tile that happens to
render geometry instead of bars.

This is the moat versus PowerBI (no 3D) and versus existing BIM dashboards (3D
bolted on as a separate, non-cross-filtering panel).

### Highlight vs filter

PowerBI distinguishes the two and we will too:

- **Highlight** — non-selected items dimmed/ghosted, still present. Default
  for clicks. Reversible by clicking the same target again.
- **Filter** — non-selected items removed entirely. Opt-in via a tile control
  or modifier key. Persisted in URL.

In the viewer that means: highlight = ghost mesh + accent on selected;
filter = isolate (existing `UnifiedBIMViewer` `isolation` prop).

---

## Bad models are the product, not the failure mode

The Speckle crash isn't just an architecture problem — it's also a reality
about real-world IFC. Most files have empty containers, untyped elements,
orphan geometry, and relationships that grow crazy. A BIM intelligence
platform exists to help operators triage exactly that mess. **Crashing on the
input the platform is built to help with is a contradiction.**

Operating principle: **model quality issues are first-class filterable data,
not error conditions.**

- The viewer renders geometry even when relationships are broken. Unparented
  mesh, missing `IfcType` reference, malformed `IfcRelContainedInSpatialStructure`
  → render the mesh, mark the issue, move on. Never abort a load because a
  relationship is wrong.
- `ExtractionRun.processing_log` already captures this for the parser (no
  silent data loss — CLAUDE.md). The embed extends it: every quality issue is
  written to a structured store that the dashboard can query like any other
  dimension. "Show me the untyped walls" is a first-class query, identical in
  shape to "show me the load-bearing walls."
- The viewer can highlight problem geometry the same way it highlights any
  other filter. Click `quality.untyped` → those instances ghost-highlight in
  the scene; tile counts re-project.
- Per-tile error bubbles (Robustness §3) only fire on **platform** failures
  (network, OOM, WebGL loss, fragment timeout). Source-data problems are
  never surfaced as errors — they show up as filterable data and as counts on
  dedicated quality tiles.
- The `FilterContext` includes a `quality` namespace (see [Filter context shape](#filter-context-shape)).
- Dedicated quality tiles ship as part of MVP — see [Tiles](#tiles).

This is a distinct concern from the Robustness contract below. That contract
covers **platform robustness** (don't crash on platform problems). This
section covers **source-data robustness** (don't crash on the BIM problems
that motivate the platform). Both are required.

---

## Robustness is a non-negotiable

**Context:** Speckle's PowerBI plugin embeds a 3D scene inside the BI host's
WebView. Operator experience: 100% system crash under realistic use.

That failure mode is informative. The lesson is not "Speckle wrote bad code" —
it's that **3D + BI-host-process is a memory contract no plugin can win**:
- The BI host hands the embed a scarce, opaque memory budget.
- The plugin loads geometry into that budget.
- The host crashes; the plugin gets blamed; the user can't recover the file.

Sprucelab's embed has to refuse this trap by construction, not by being more
careful in the same trap.

### Robustness contract (binding for every PR in this track)

1. **Iframe boundary, always.** The embed runs in its own browser process.
   A viewer crash, OOM, or hung tab cannot take down the host page. This is
   the single biggest difference from the Speckle model and it's free with
   iframe-based embedding.

2. **Hard memory budget per scene.** The viewer enforces a configurable hard
   cap (default 1 GB GPU + 1 GB RAM). Above the cap, geometry is paged out by
   LOD level — no scene ever loads "the whole model" into VRAM. Fragments
   already give us the per-element granularity to do this; we just have to
   actually do it.

3. **Tile failures are isolated.** A tile that throws renders an inline error
   bubble; the rest of the dashboard keeps working. The viewer is a tile —
   same rule. No tile gets to crash the page.

4. **Backpressure on filter changes.** If the outer page (or a user mashing
   filters) emits 50 filter changes per second, the viewer debounces and drops
   intermediate states. Tiles render a "thinking" state instead of queuing up
   work. Last-write-wins on the filter context.

5. **WebGL context loss is recoverable.** `webglcontextlost` listener,
   teardown of all GPU resources, automatic re-init on `webglcontextrestored`.
   Without this, tab-switching kills the viewer permanently on memory-pressured
   machines.

6. **Explicit teardown contracts.** Three.js + ThatOpen leak by default.
   Every `IFCComponents` instance is owned by one React component, disposed in
   its cleanup. Memory leak smoke test on PR: open dashboard, navigate away,
   navigate back, repeat 20×, assert heap doesn't grow more than 10%.

7. **No host-page trust.** The iframe never reads from `window.parent`.
   Communication is `postMessage` only, with strict origin allowlist + schema
   validation on every message. The host page can ask for things; the embed
   decides whether to honor them.

8. **Degraded mode is a real mode.** If fragments fail to load, the dashboard
   renders without the viewer tile, with a "viewer unavailable" affordance.
   The non-3D tiles must work without 3D ever loading.

9. **Bounded query budget per filter.** Every filter change triggers at most
   N concurrent requests across all tiles (configurable, default 6). Tiles
   queue their requests through a shared scheduler; no fan-out spam.

10. **Telemetry on every failure.** Memory pressure, WebGL loss, fragment
    load timeouts, postMessage origin rejections — all reported back to
    Sprucelab via a beacon endpoint. We will know when an embed is hurting
    before the user does.

These ten items are the **acceptance criteria** for the embed POC. Anything
that ships without them is not the embed.

---

## Architecture

### `DashboardFilterProvider` — the shared bus

Every dashboard page wraps its tiles in a `DashboardFilterProvider`. The
provider holds the filter context, persists it to the URL (and parent-frame
hash via postMessage), and exposes `useFilterContext()` + `useFilterMutation()`
hooks.

**Filter shape (initial draft — finalized in the implementation PR):**

```ts
type FilterContext = {
  // Project scope (always set)
  project_id: string;

  // Dimensional filters (all optional, multi-value)
  ifc_class?: string[];      // ["IfcWall", "IfcSlab"]
  ns3451?: string[];          // ["23X", "26"]
  floor_code?: string[];      // ["03", "04"]
  mmi?: number[];             // [350, 400]
  load_bearing?: boolean;
  fire_rating?: string[];
  material?: string[];
  type_id?: string[];         // canonical TypeBank IDs

  // Quality dimensions — first-class, filter the same way as any other.
  // Setting any flag scopes the result set to elements that have that issue.
  // (See "Bad models are the product" above — these are not errors.)
  quality?: {
    untyped?: boolean;             // element has no IfcType reference
    orphan?: boolean;              // not in any IfcRelContainedInSpatialStructure
    empty_container?: boolean;     // container with no contained elements
    missing_relations?: boolean;   // expected rel missing (e.g. wall w/o storey)
    invalid_geometry?: boolean;    // geometry failed tessellation
    missing_psets?: string[];      // names of expected psets that are missing
    missing_material?: boolean;    // no material assignment
  };

  // Mode
  mode: "highlight" | "filter";

  // Selection (single-element, distinct from filter)
  selected_express_id?: number;
};
```

Invariants:
- Filter context is the **single source of truth**. Tiles never hold their
  own filter state.
- All keys are URL-serializable. The URL is the deeplink.
- Setting any key to `[]` is the same as `undefined` (unset). Tiles encode
  this consistently.

### Viewer as a tile

`UnifiedBIMViewer` becomes a `DashboardFilterProvider` consumer. Existing
`isolation` prop is rewired: instead of being passed by the parent, it's
derived from the filter context via the
[Semantic-to-concrete resolver](#semantic-to-concrete-resolver).

Cross-filter from viewer → tiles: viewer click handler emits
`setFilter({ifc_class: [...], type_id: [...]})` based on what was clicked.
The viewer doesn't know about charts; it just speaks the same filter
vocabulary.

### Semantic-to-concrete resolver

The filter context is **semantic** (`ifc_class=IfcWall`); the viewer needs
**concrete** (a list of express IDs to isolate or highlight).

**Decision: server-resolved.** A new endpoint:

```
GET /api/embed/instances?project_id=...&ifc_class=IfcWall&floor_code=03
→ {
    type_ids: ["uuid", ...],
    instance_express_ids: [42, 137, ...],
    count: 1842,
    truncated: false
  }
```

The viewer subscribes to this endpoint via React Query, keyed on the filter
context. When the filter changes, the cached express-ID list is what the
viewer applies.

Why server-resolved over client-side joining:
- The full instance index is too large to ship to every embed.
- Server-side aggregation already exists (warehouse, type-browser, floors).
- Cache invalidation is simpler — one endpoint, one cache key shape.
- Permissions/scoping is already enforced server-side.

Truncation rule: if `count > 5000`, return `truncated: true` and the first
5000 express IDs by GUID. The viewer falls back to **highlight by type**
(every wall, dimmed) instead of per-instance isolation.

### Tiles

Existing dashboard primitives generalize:

- **MetricCard** — already filter-aware via existing hooks.
- **TypeBrowser** — already in the warehouse, generalize to take filter context.
- **FloorsTable** — F-3 work just landed (`backend/apps/projects/views.py`),
  hook it up.
- **TypeDistributionChart** — new, but trivial once filter context exists.
- **PropertyHistogram** — new, MMI/NS3451/load-bearing distributions.
- **ViewerTile** — `UnifiedBIMViewer` wrapped to consume filter context.

**Requirements tiles** (the primary metric framing — see
`feedback-iso19650-requirement-fulfillment.md`):

- **RequirementFulfillmentSummaryTile** — "X of Y EIRs fulfilled" with a
  click-through to the requirements list. Replaces every "health score" tile
  in the existing UI.
- **RequirementListTile** — table of requirements with per-row status
  (fulfilled/partial/unfulfilled), fulfilled/total counts, owner. Click a
  row → cross-filter to that requirement's evidence and gaps.
- **RequirementGapsTile** — flat list of gaps across the active filter,
  attributable to specific requirements. "187 untyped walls (EIR-07)",
  "12 storeys missing elevation (EIR-04)".

**Quality tiles** (model-data-shape, presented as inputs to requirements):

- **UntypedElementsTile** — count + drill-in for elements without an IfcType
  reference. Click → `quality.untyped = true`. When this tile sits on the
  Requirements Fulfillment dashboard, it's grouped under the EIR(s) that
  require typing.
- **OrphanGeometryTile** — count of unparented mesh.
- **EmptyContainersTile** — containers with no contents (storeys without
  elements, spaces without zones, etc.).
- **MissingRelationsTile** — expected relationships that are absent.
- **MissingPropertiesTile** — elements lacking psets the project config
  expects (driven by `ProjectConfig` rules → EIR acceptance criteria).

Requirements tiles are the primary surface; quality tiles sit one level
below them, scoped by which requirement they affect. Standalone quality
tiles still exist on the Type Browser dashboard for triage workflows where
the user is already deep in the data.

A tile is just a React component that:
- Takes no `filters` prop — reads from `useFilterContext()`.
- Reads via React Query, with the filter context as part of the query key.
- Renders an inline error bubble on its own failure (see robustness #3).
- **Never** renders an error bubble for source-data problems — those are
  handled as data, not exceptions.

---

## Embed mechanism

**Decision: iframe + postMessage.**

The iframe carries the entire dashboard page (Vite-built React app, served
from a Sprucelab subdomain). The host page (skiplum-pages, others) embeds via:

```html
<iframe
  src="https://embed.sprucelab.io/dashboards/<dashboard-id>?token=<scoped>"
  style="width:100%; height:600px; border:0"
  allow="fullscreen"
></iframe>
```

postMessage protocol (versioned via `protocol_version: 1`):

| Direction | Type | Payload |
|---|---|---|
| host → embed | `set_filter` | partial `FilterContext` to merge |
| host → embed | `request_height` | (no payload, requests current scrollHeight) |
| embed → host | `filter_changed` | full `FilterContext` after a user action |
| embed → host | `selection_changed` | `{express_id, ifc_class, type_id}` or `null` |
| embed → host | `height` | `{px}` for auto-resize |
| embed → host | `error` | `{code, message, recoverable}` |
| embed → host | `ready` | (handshake, sent once on load) |

Origin allowlist: every embedded dashboard has a list of allowed parent
origins (set per scoped token). Messages from any other origin are dropped
silently.

**Why iframe over web component / JS SDK:**

- **Crash isolation** is the entire point (robustness #1).
- The dashboard + viewer cross-filter only works if they share a DOM. Embedding
  individual tiles into the host's React tree would break the filter bus the
  moment a viewer tile was one of them.
- Auth scoping is cleaner — the iframe URL carries the token; the host page
  never sees it.
- ThatOpen + Three.js + Vite chunk loading are large; bundle isolation is a
  feature, not a problem.
- Web components were considered. Rejected: same DOM = same crash domain,
  defeats robustness #1.

Drawbacks accepted:
- Slight UX awkwardness for hover-out tooltips (mitigated: tooltips render
  inside the iframe).
- Auto-height requires postMessage roundtrip on resize. Acceptable.
- SEO inside the embed is moot (it's authenticated content).

---

## Auth model

**Scoped tokens** (capability tokens — Agent-Workflows §Roadmap #2). A token:

- Is bound to a `project_id` and a list of allowed parent origins.
- Has a short TTL (default 1 hour) and a refresh endpoint.
- Carries a capability set: `read:dashboards`, `read:types`,
  `read:instances`, etc. No write capabilities for v1.
- Is revocable by the issuer (Sprucelab admin) at any time.

Token issuance flow:

```
1. Sprucelab admin creates an "Embed Pass" for project X, allowed origins
   [https://skiplum-pages.example, ...], TTL 1h, refresh enabled.
2. Skiplum-pages backend (or a server-side function) calls the Sprucelab
   issuance endpoint with its API key, gets a short-lived embed token.
3. Skiplum-pages renders the iframe with that token in the URL.
4. The iframe page validates the token on first load, opens an authenticated
   session for the page lifetime.
```

CORS allowlist is set per-token at issuance time. The Railway `CORS_ORIGINS`
env var (Agent-Workflows §6) handles the API surface; the per-iframe origin
check happens in the dashboard page itself for postMessage.

---

## MVP dashboard set

The first three dashboards to ship (one PR each after the platform PRs land):

1. **Requirements Fulfillment** — the primary surface. ISO-19650-shaped:
   "X of Y EIRs fulfilled" + a list, each with status, fulfilled/total counts,
   and a drill-in. Quality tiles (untyped, orphan, empty containers, missing
   relations, missing properties) live **inside the requirements they violate**,
   not as standalone metrics. **No `health_score`** — the score is wrong by
   construction (see `feedback-iso19650-requirement-fulfillment.md`). Viewer
   tile added once filter context is wired and the EIR resolver returns
   express IDs for the gaps.
2. **Type Browser** — already exists, port to dashboard layout +
   filter-context-aware. Viewer tile included.
3. **Floors Overview** — F-3 work (just landed) reframed as a dashboard.
   Viewer tile, floor table, deviation badges.

These three exercise the filter context end-to-end (project → type → floor),
the viewer cross-filter loop, and the quality dimension as filter input *into*
requirements. The Requirements Fulfillment dashboard doubles as the proof
that "bad models are the product" — operators land there, see exactly which
EIRs aren't met and why, click into the gap, and nothing crashes.

**Depends on the ISO 19650 framework plan** (`docs/plans/2026-05-03-21-30_ISO19650-Framework.md`)
— the Requirements Fulfillment dashboard cannot ship before the
`InformationRequirement` + `RequirementFulfillment` domain models exist.

---

## Implementation order (PRs)

1. `docs: forward-deployed dashboard plan` — this doc.
2. `embed: DashboardFilterProvider + filter context types` — pure types and
   provider, no UI changes yet. Includes URL serialization.
3. `embed: /api/embed/instances resolver endpoint` — semantic→concrete, with
   tests. Truncation logic. Includes `/api/embed/capabilities` advertising
   what the embed can ask for.
4. `embed: scoped token middleware + iframe page route` — `/embed/:dashboard`
   served via the existing Vite app, postMessage handshake, origin allowlist.
   Hardcoded one-dashboard renderer for handshake testing.
5. `embed: ViewerTile + filter→isolation wiring` — `UnifiedBIMViewer` wrapped
   as a filter-context consumer, with the resolver-driven isolation. Includes
   highlight/filter mode toggle.
6. `embed: TypeBrowser tile + cross-filter loop` — full bidirectional filter
   loop with one chart-shaped tile. End-to-end demo.
7. `embed: robustness pass` — items 2–10 from the robustness contract that
   weren't already in earlier PRs (memory cap, leak smoke test, telemetry
   beacon, degraded mode, etc.).
7a. `embed: model-quality dimension` — `quality.*` filter context keys, the
   `ModelQualityIssue` store (or equivalent extension of `ExtractionRun`),
   resolver endpoint scoping, and the quality tiles. Lands before MVP
   dashboards because dashboard 1 depends on it.
8. `embed: Requirements Fulfillment dashboard` — first MVP dashboard.
9. `embed: Floors Overview dashboard` — second MVP dashboard.
10. `embed: skiplum-pages integration` — actual embed inside skiplum-pages,
    behind a real scoped token.

PRs 1–7 are the platform; 8–10 ship product on top of it. Each PR is a
self-contained read for a future maintainer.

---

## Open questions

These need answers before the implementation PRs commit to a direction.
The edkjo session, with skiplum-pages context to hand, is well-placed to
take a pass on most of them.

1. **Skiplum-pages layout primitives** — does skiplum-pages contribute its
   layout/wireframing system back into `frontend/src/components/`, or does
   it stay external and the embed just inherits its visual language? The
   answer shapes how much of the dashboard-grid layout is built fresh in
   sprucelab vs. lifted.

2. **Truncation threshold for the resolver** — 5000 was a guess. Real
   answer depends on viewer perf with N highlighted instances. Needs a
   smoke test.

3. **Token issuance UX** — does Sprucelab grow an admin UI for creating
   embed passes, or is it CLI-only for v1? CLI-only is faster to ship.

4. **Filter context schema versioning** — when we add a new filter dimension
   six months from now, does the postMessage `protocol_version` bump or do
   filters extend openly? Extending openly is friendlier; bumping is
   stricter.

5. **Highlight rendering mode** — ghost mesh + accent on selected, or
   transparency-based? Three.js transparency has known artifacts with the
   ThatOpen geometry pipeline. Needs a viewer experiment before we commit.

6. **Embed dev-loop** — is there a local skiplum-pages clone we can iframe
   against `localhost:5173/embed/...` during development? Or do we need a
   second compose service that mimics it? Affects PR 4's test plan.

7. **Mobile / responsive** — out of scope for MVP, but the dashboard grid
   primitives picked in PR 2 will either accommodate it or not. Worth
   thinking about now even if shipping doesn't.

8. **Post-MVP**: dry-run mutations through the embed, "save filter as view"
   for shareable URLs that survive token rotation, multi-project dashboards,
   custom-tile DSL.

9. **Quality dimension storage shape** — extend `ExtractionRun.processing_log`
   in place, or add a dedicated `ModelQualityIssue` table indexed by
   `(project_id, model_id, ifc_class, issue_type, express_id)`? The latter is
   queryable with normal Django ORM patterns and JOINs cleanly with type/floor
   filters; the former keeps everything in one log stream. Lean towards
   dedicated table; needs a migration sketch in PR 7a.

10. **Quality detection coverage** — the parser already drops/skips/coerces
   on bad input. Which issue types do we surface in the dashboard at MVP, and
   which wait? Untyped + orphan + empty-container is the obvious starting
   set. Missing-psets needs `ProjectConfig` rules to be alive (they are —
   F-2/F-3). Invalid-geometry needs parser instrumentation that may not exist
   yet. Audit before PR 7a.

---

## Non-goals (for this track)

- Full mutation API in the embed. Reads only for v1.
- A custom tile authoring system. Tiles are React components in this repo;
  the embed isn't a no-code dashboard builder.
- White-labeling beyond CSS theming. Sprucelab branding stays.
- Replacing the in-app dashboards. The embed and the in-app surfaces share
  the same `DashboardFilterProvider` and tile components, but the embed is
  a different deployment target, not a replacement for the authored UI.

---

**Status check before any of PRs 2–10**: this document needs sign-off from
the user (and ideally a second pass from the edkjo session with skiplum-pages
context). Don't start coding the platform layer until the open questions
above have at least one-line answers.
