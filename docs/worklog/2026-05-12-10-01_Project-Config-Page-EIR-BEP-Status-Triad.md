# Session: Project Config page — EIR · BEP · Status triad

## Summary

Morning continuation after the autonomous overnight Types v2 polish. Six
new commits between 518bd97 (filter-reactive KPIs) and 8121447 (EIR ·
BEP · Status triad). The session moved from one-more-polish-on-Types-v2
to a substantial architecture decision: the Project Config page now
hosts the ISO 19650 EIR ↔ BEP ↔ Status triad per concern, not just a
BEP editor. The Dashboard reframing implied by that is queued.

Why it matters: the Sprucelab platform now has an explicit surface for
the contract layer (what client requires + what project commits + what's
delivered) that the rest of the platform reads from — including the
"Missing classification" KPI we shipped yesterday, which should
template on the active EIR-required classification system per
`feedback-classification-driven-by-eir.md`.

## Changes

### `518bd97` — KPIs react to filter, show total in parens
User feedback after the overnight ship: KPIs stayed project-wide even
when the filter narrowed the dataset. Now the foreground number is the
filtered value, with the unfiltered total shown beside in muted "/ N".
TypeBrowserV2 builds both `totalStats` and `filteredStats`; `stats`
merges filtered scalars with total distributions (sparklines stay
project-scoped). `isFiltered` flag gates the `/ total` rendering.
KpiCard gained an optional `totalValue` baseline-aligned beside the
big number.

### `c1a8184` — BEP/EIR restore-from-archive plan doc

Investigation kicked off by the user asking "where did the CRS
dropdown / canonical floor editor / project basepoint config go?".

Answer: archived 2026-04-29 in commit `e993e8f` under "replaced by the
data-foundation pipeline". The whole stack — backend
(`archive/backend/bep/`, 1340+ lines: bep / eir / response / validation
models, serializers, views, management commands) AND frontend
(`archive/frontend/{bep,eir,pages,hooks}/`, ~2803 lines: CoordinateSystemForm
with NTM 5-14 + UTM 32/33/35 + NN2000 + basepoint, StoreyTable,
DisciplineTable, MMITableMaker, TechnicalRequirementsForm, EIROverview,
EIRRequirementList, IDSSpecList, BEPResponsePanel, ComplianceDashboard,
use-bep / use-eir hooks).

Plan doc at `docs/plans/2026-05-12-07-50_BEP-EIR-Restore-From-Archive.md`
captures: archive locations, reconciliation work against the Phase 2-5
data-foundation models (`ProjectScope` / `ProjectConfig` / `entities`
→ `types` app rename), and a 5-PR sequencing (backend restore, frontend
restore, sidebar wiring, EIR → Types v2 classification wire-up, deeper
integrations).

### `c6fe509` — Project Config page foundation

User said "Now is the time to implement" after admitting the archived
version was "more of a mockup than a real solution". Listed 12
concerns: floors, CRS, basepoint, control point, MMI/LOD,
classification, IFC schema, custom properties, naming conventions,
project grid, site model (lokasjonsplan), scopes. Followed up with OSM
+ pyproj/EPSG-full + GIS placement tool for the coords/site model.

Built `/projects/:id/settings` route with the 12-section IA grouped
into Geometry & Place / Scope & Org / Standards & Requirements. Left
sub-nav lists sections with state chip (live / partial / planned).
URL-deep-linkable via `?section=<id>`. Floors is the only `live`
section (lifts existing ProjectFloorsTab from Dashboard's Floors tab).
Other sections render with scope statement + body capturing the user's
implementation directives verbatim.

Section data lives in `frontend/src/components/features/settings/sections.ts`
so adding/reordering is a one-file edit.

### `39ecf69` + `236e81b` — Sidebar placement fix

First try: added Project Config as a separate section block at the
bottom of the in-project nav. Bbox check showed it landed at y=832
inside the user-profile row at y=798 height=93 — visually hidden.
Moved it next to Dashboard in the "Project Overview" cluster with
SlidersHorizontal icon — top of in-project nav where it belongs as a
project-level concern.

### `8121447` — EIR · BEP · Status triad

User reframed the Settings page mid-session: it's not just BEP
authoring — it's the EIR ↔ BEP ↔ Status triad per ISO 19650. Three
distinct things that need to be visible side by side.

Each section's right pane became a three-column layout:

- **REQUIREMENT (EIR)** — read-only italic blockquote with border-left
  rule + source attribution ("EIR §4.2 — Geometric reference"). For
  every section I authored plausible client-EIR text and a section
  reference so the page reads as a real audit form even before EIR
  docs are imported. Card hint says "Placeholder — no EIR document
  loaded yet".
- **COMMITMENT (BEP)** — widest column (`xl:grid-cols-[1fr_1.4fr_1fr]`),
  primary/30 accent border, editable form area. Floors renders the
  existing live ProjectFloorsTab here. Other sections show body lines
  as bullets + disabled "Configure" CTA with tooltip explaining the
  form is queued.
- **STATUS** — forest/25 accent border, traffic-light + drill-in
  column. Floors shows a "wired — see BEP column" hint. Other sections
  show "Not configured yet" with explanation that fulfillment populates
  when both BEP commitment is set and model data is in.

Layout stacks vertically below xl breakpoint. Page subtitle "EIR · BEP
· Status" signals the triad framing.

### Memory entries created this session

- `feedback-classification-driven-by-eir.md` — classification system
  comes from the project's EIR/BEP, never hardcoded. NS3451 is one of
  several (OmniClass / Uniclass / multi); per-project hook is the
  integration point.
- `bep-eir-archive-restore-plan.md` — archive locations + restore
  reconciliation work.
- `strategy-vs-forma.md` — three must-builds (project config w/ real-
  world placement, presence/collab, IDS authoring) + three explicit
  skip-don't-builds (Revit plug-in, simulations, generative). Don't
  apologize for being Norwegian-default.
- `feedback-config-is-eir-bep-status-triad.md` — every Settings
  section renders three columns (EIR · BEP · Status), not one. The
  Dashboard simplifies to EIR fulfillment ribbon + Attention feed +
  Recent activity instead of mirroring Settings.

## Technical details

**KPI filter reactivity**: extracted a single `computeStats(slice)`
function used twice — once on `types` (totalStats), once on
`filteredTypes` (filteredStats). Final `stats` merges filtered scalars
with total distributions so the sparkline color vocabulary stays
project-scoped while numbers move with the filter. `useCountUp` still
animates the foreground number; the "/ total" snaps without animation
to read as a stable reference value.

**Settings IA captures user directives in code, not in chat**: each
section's `scope` (one-liner) and `bepBody` (multi-line) and now
`eirRequirement.text` are the user's actual words preserved in
`sections.ts`. When the user sees a placeholder card on the live page,
they're reading their own implementation brief — easy to spot if I
captured a directive wrong.

**Sidebar placement gotcha**: the in-project nav sits in a flex layout
with `<nav className="flex-1">` above a fixed-position user-profile
row. Adding sections at the bottom of nav pushes content into the
user-row's vertical space (they overlap at the bottom). Sections that
need to be reachable at typical viewport sizes must live in the upper
half of the nav. Moved Project Config to the Project Overview cluster
next to Dashboard.

**EIR placeholder text quality**: wrote plausible Norwegian-context
EIR requirement text per section, with §-references. The Coordinates
EIR mentions ETRS89/NTM, NN2000, basepoint + control point, ±0.1m /
±0.1° tolerances. The Classification EIR mentions NS 3451:2009 +
optional IFC `Pset_ClassificationReference`. The MMI/LOD EIR mentions
Statsbygg MMI-veileder 2.0. This isn't real EIR — but it's
contractually plausible, so the page reads as a real audit form rather
than lorem ipsum.

**Verification end-state**:
- Frontend: `yarn type-check` clean on every commit. Vercel deployed
  every push; final bundle `index-BDwipKrs.js`.
- Railway: `/api/health/` healthy throughout.
- Browser: navigated to `/projects/:id/settings` on the live G55
  project, verified the triad layout renders with quoted EIR text +
  BEP body + Status placeholder.

## Next

- **PRIORITY: Replace the prose EIR placeholders with structured editable
  fields per section.** EIR is settings too, not loaded prose. The right
  shape per section is a small form: dropdowns / number inputs / toggles
  for each requirement with a "required" / "optional" toggle. Same
  shape pattern for the BEP column with an "inherit from EIR" default.
- **Restore the BEP backend** from `archive/` (per the plan doc, PR 1).
  Reconcile with `ProjectConfig`/`ProjectScope` from Phase 2-5. This
  unblocks PR 2-5: real BEP forms in each section's middle column +
  real Status computation in each section's right column.
- **EIR-driven classification**: replace the hardcoded NS3451 check in
  Types v2 "Missing classification" KPI with a hook reading the active
  EIR-required classification system. Per
  `feedback-classification-driven-by-eir.md`. Frontend-only interim
  hook with default `'ns3451'` is ~30 lines.
- **Dashboard reframing**: per
  `feedback-config-is-eir-bep-status-triad.md`, the Dashboard
  simplifies. New shape: EIR Fulfillment ribbon (X/Y EIRs met) +
  Attention feed (deviations, gaps, new claims) + Recent activity.
  Old tab structure (Overview / Models / BIM / Floors) dissolves:
  Floors → already in Settings, Models → already at `/models`, BIM
  workbench → already at `/types?v=2`. Overview becomes the new
  EIR-driven hero.
- **OSM + pyproj integration** for the Coordinates section's GIS
  placement tool. New backend endpoint via pyproj for projection;
  frontend uses Leaflet / Maplibre + Kartverket WMTS for NO. Multi-
  week scope.
- **Bottom-row KPI sparklines** on Types v2 still visually subtle —
  ~10-line fix.

## Notes

- **Late-session correction (just before this worklog)**: user reframed
  the EIR column again. *"The EIR should just be a setting. EIR
  editor. Not text like that."* Translation: the quoted prose EIR
  placeholders I wrote (`§4.2 — Geometric reference` etc.) are the
  wrong shape. EIR isn't a loaded external document with prose
  requirements — it's structured config the Information Manager
  edits AS SETTINGS too. So both EIR and BEP are editable forms; EIR
  edited by client/IM, BEP edited by project team. The Status column
  stays derived. This needs a follow-up PR to replace the
  `eirRequirement.text` quoted-prose pattern with structured editable
  fields (required-vertical-datum dropdown, required-horizontal-crs
  dropdown, required-tolerance number input, with a "required"
  toggle per row). The text I authored stays as a starting point for
  copy when each field's label / hint is written, but the rendered
  column shape must change.
- The user is in active design-discussion mode this session, not pure
  build mode. Each architectural step is a back-and-forth: I propose,
  they refine, memory captures, code follows. The triad reframing was
  the third revision in this thread (started as edit-only, then
  edit+consume on Dashboard, now EIR+BEP+Status everywhere, now EIR
  as editable settings not prose) — capturing each in memory as we go
  keeps the architecture from drifting back.
- Memory entries this session matter MORE than the code. The code is
  scaffold; the memory entries are the durable architectural
  decisions that survive context resets.
- The CoordinateSystemForm sitting in `archive/frontend/bep/` is 310
  lines of solid Norwegian-CRS-aware UI. When the archive restore
  happens, that form is the BEP column of the Coordinates section
  almost verbatim.
- 20+ stale `.claude/worktrees/agent-*` cleanup still pending.
