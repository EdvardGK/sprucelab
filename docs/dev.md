# Sprucelab — Dev

> **Canonical project tracker.** Every Claude session and every agent reads this file at session start. Edit this file to update progress; do not put the content anywhere else.
>
> **Finish line** = core flows work and feel sound, not optimized. The dashboards view; the workbenches annotate. Source models are sacred — Sprucelab data lives on top, never silently overrides. Aspirational modules wait. This file is the line.

---

## Why Sprucelab

The industry has invested billions in BIM authoring; the data is stranded inside authoring tools and view-only viewers. The people who *use* models (coordinators, LCA, cost, owners, agents) are second-class to authors. Sprucelab flips the frame: **files in → structured data out, dashboards over viewers, annotations layered on top that never silently mutate the source, agent-first by default.** Human-only BIM tools will lose to agentic competitors that can read, verify, and propose at scale.

**Projects are the unit.** Each project is its own isolated container — its own models, its own EIR, its own scope, its own Claims/Annotations/Issues. Federation across projects is opt-in: TypeBank cross-project corpus accrues as a shared classification memory; forward-deployed embed links surface filtered views from any project inside other tools. Cross-project intelligence is a layer on top of separate projects, never a default that blurs ownership.

**Now.** ifcfast + fragments-v3 + cheap LLMs make the data layer tractable for the first time. The "type is the unit of coordination" insight (50k entities, ~300 types) lets the platform win on coordination intelligence without fighting authoring tools on geometry.

---

## The spine — Claims / Annotations / Issues

Three distinct primitives in the proposal-and-routing layer. Don't conflate them.

| Primitive | Origin | What it is | Lifecycle |
|---|---|---|---|
| **Claim** | AI-extracted from docs / site traffic / extraction signals; confidence-graded | A normative statement competing with ProjectConfig for ownership | unresolved → promoted / rejected / superseded |
| **Annotation / Proposal** | Manual or agent; attached to a source entity | An overlay on source data (material X→Y, property override, drawing label) | proposed → accepted / rejected → optionally exported as pset (forks source) |
| **Issue** | Manual OR auto-generated when a Claim / Annotation needs human routing | A routed work ticket with assignee + status + priority | open → in-progress → resolved / closed |

**Composition.** A Claim can promote into an Annotation when it lands on data. An Annotation can route as an Issue when it needs sign-off. A failed verification can spawn an Issue directly. These flows are explicit, not implicit.

**Source-is-sacred contract.** Exporting an accepted Annotation as an IFC pset MUST fork the source model with provenance (source + applied annotations). The original is never silently mutated. Annotations remain queryable after export.

**Status today:** Claims is the only primitive built (document-rule slice → ProjectConfig promotion). Annotations and Issues are missing. References to "View All Issues" exist in MyPage / ProjectMyPage but the page does not exist.

---

## Punch list

Concrete "feels off" / "broken" / "missing" items blocking finish line.

> Verbatim user stream 2026-05-16: `docs/plans/2026-05-16_user-feedback-stream-finish-line.md`. Each item below traces back to a quote there.

### Cross-filter "feels right" (P0 — user has flagged some of this "a million times")

- [ ] **Treemap → viewer cross-filter is broken** — user verbatim: *"Treemap is not crossfiltering to viewer. Something is fundamentally off since I have said this a million times."* Diagnose end-to-end on the Type page first. The data-extraction (TYPE class) vs fragments-runtime (ENTITY class) mismatch is documented (`data-extraction-vs-fragments-runtime-mismatch.md`); `entity_ifc_type` field shipped backend-side in commit `4215e1d`. Confirm the frontend wires the prefixed `IfcWall` form through to `typeVisibility` AND `useTypesInstancesByClass` returns matching GUIDs. P0.
- [ ] **Same-click toggles off** — verify on every dashboard surface (treemap, quality chip, storey bar, type chip, table row).
- [ ] **Counts agree across tiles** — viewer subtitle "4 types · 73 instances" must equal treemap + KPI + table. Pick one source per dimension, eliminate drift.
- [ ] **Count-up animation everywhere** — Types page does it. Spread to Model dash KPI cluster, Materials, Project dash. The animation IS the signature.
- [ ] **Persistent viewer everywhere** — ViewerPane + isolation prop shipped on Type + Model dash (2026-05-15). Confirm Materials and Project dash do not remount on filter changes.
- [ ] **Source-of-filter is highlighted, never self-filters** — when the user clicks a treemap tile (or any chip / chart segment / bar), the clicked tile gets a highlighted state but the treemap itself stays whole. Only the *other* surfaces (viewer, KPI tiles, table, sparklines) adapt to the active filter. PowerBI pattern — the filter activator must remain visible at full strength so the user can swap classes, see the macro context, and unfilter with one click. Currently the treemap appears to react to its own click; needs the "filter producer ≠ filter consumer" split codified on every cross-filter surface.

### Spine — Claims / Annotations / Issues

- [ ] **Annotations / proposals primitive** — new first-class entity. Target = any source data (Type material, Instance property, Drawing zone, Document statement). `proposed_value` JSON, status (proposed/accepted/rejected), `export_action` (none / pset-writeback / forks model). Parallel to Claims, distinct from Issues.
- [ ] **Issues** — referenced at `/projects/:id/issues?assignee=me` from MyPage cards but the route does not exist. Routed work tickets with assignee, status, priority, source ref. Auto-generated when verification fails / Annotation needs sign-off / Claim is rejected with action.
- [ ] **Pset writeback + explicit fork semantics** — exporting accepted Annotations as IFC psets creates a forked model with provenance. Source is never silently mutated.
- [ ] **Workbench surfaces per entity** — dashboards view; workbenches annotate. Mapping workbench is the prototype. Pattern needs to spread to Material (LCA proposals), Instance (overrides), Drawing (annotations), Opening (lifecycle).
- [ ] **Claims AI engine + LLM API key + agent framework** — drop-in API key to point Claims extraction at any LLM provider. Automatic-calls / agent framework that runs the extractor on uploaded documents and site traffic. Per-project provider key + per-tenant rate limit.

### Project rules + verification + GIS site map

- [ ] **Project rules editor — great, simple, intuitive** — user verbatim: *"a great, and I mean great, simple and intuitive project rules editor."* Output: verification rules consumed by the engine. Lives under project admin (limited-visibility scope); user-facing summary lives at the EIR/BEP page in the Projects section of the sidebar.
- [ ] **Verification x/n in Model KPI card + full list in Verification tab** — every Model surfaces "N of M project requirements met" + drill-in list.
- [ ] **Type flags for non-compliance** — Types that fail rule checks get a flag chip on the Type page. MMI, classification, fire rating, etc. all routed through the same rule engine.
- [ ] **GIS-style site map** — project rules output a project scene viewable as a top-down GIS map AND as an optional underlay layer in the model viewers. Builds on the existing site-environment architecture (`site-environment-architecture.md`).

### Sidebar IA — Files / Data / Project / Workspace

- [ ] **Sidebar reorg** — user verbatim: *"Clean up the sidebar into Files, Data, Project, Workspace (Project at the top with 3d viewer, Events, Meetings, Teams)."* Project group at the top, contains 3D viewer + Events + Meetings + Teams. Files, Data, Workspace as siblings.

### Event + Meetings module + version locking

- [ ] **Event module** — user flagged this "many times". Calendar + Gantt + Kanban + document/delivery table. Sits inside the Project sidebar group.
- [ ] **Meetings module** — separate from Events. Connected to documents, deliverables, models.
- [ ] **Version-locking on events** — not a full versioning module; track WHICH versions of models / drawings / documents were valid / active at the time of an event. Snapshots of state, queryable later.

### Scopes — secondary project containers

- [ ] **Sub-project / scope container** — user verbatim: *"LBK as the project, but LBK has Building A, B, C and will live for many years and be built by different teams, but the project management and support structure is the same for all. Could be different stages of a project as well."* Implement as a Scope entity under Project, used for sub-buildings AND lifecycle stages (early design / design / construction / handover). Same project setup; different active sub-scopes per team / phase.

### Workspaces — personal + company

- [ ] **My Workspace** — individual user's workspace surface. Their assigned issues, recent activity, pinned dashboards, draft annotations. Cross-project.
- [ ] **Company Workspaces** — org-level container the company itself owns, hard-separated from any project they participate in. WIP → Share gate the company controls. Templates + buckets for projects inside the org page. *"This has been described by me a few months ago, but not built."*

### Project admin

- [ ] **Project admin page** — invite, assign, project setup, role + rights mapping. The project rules editor lives here (limited visibility). The user-facing EIR/BEP summary lives in the Projects section of the sidebar (broad visibility).

### Viewer UX — solid tool, not the headline

User verbatim: *"The viewer is really bad now. Need great UI, with HUDs, toolbars, intuitive filtering and aggregation of data. Clean and modern. The viewer is not the main product of sprucelab, but a bad viewer gets in the way."*

- [ ] **Ghost objects + invisible elements = fragments-v3 converter geometry-coverage gap.** Diagnosed 2026-05-16 with the `shapes_probe.ifc` model (14 classes × distinct shapes × distinct colors). Coverage matrix:
  - **Renders OK** — `IfcExtrudedAreaSolid` + `IfcRectangleProfileDef` or `IfcArbitraryClosedProfileDef`.
  - **Renders as ghost (bare profile, no extrusion)** — `IfcExtrudedAreaSolid` + `IfcLShapeProfileDef` (steel angles → planar rectangle of profile bounding box).
  - **Invisible** — all CSG primitives (`IfcBlock`, `IfcSphere`, `IfcRightCircularCylinder`, `IfcRightCircularCone`, `IfcRectangularPyramid`) + `IfcRevolvedAreaSolid` (torus, hemisphere).
  - **Blocklisted by class** — `IfcOpeningElement`, `IfcOpeningStandardCase`, `IfcVirtualElement` in `backend/ifc-service/scripts/convert-to-fragments.mjs:51-55`. Won't render even with valid extruded geometry.
  - Root: `@thatopen/fragments` v3 `IfcImporter` defers all geometry to `web-ifc` WASM. Web-ifc handles a subset of IFC representation types. Fix paths: (a) replace web-ifc on the backend with `ifcopenshell.geom.iterator` → tessellated triangle meshes → fragments-from-mesh (handles every IFC representation; aligns with CLAUDE.md "always use iterator"), (b) pre-tessellate problem representations into `IfcFacetedBrep` server-side before feeding to web-ifc (band-aid), (c) file an upstream issue with ThatOpen. (a) is the architectural fix.
- [ ] **HUDs + toolbars** — clean, modern, scoped to a small set of actions: section, annotation→issue, isolate, hide, color filter.
- [ ] **Sectioning tool** — solid sectioning UX (already partial via SectionPlanes; needs the HUD treatment).
- [ ] **Annotation → Issue from viewer** — pick an element in 3D, attach an annotation, route as an Issue. Closes the loop with the Spine.
- [ ] **Filter chip rail in viewer** — same filter store as dashboards; isolate / hide / color all driven from one place.
- [ ] **Data clarity** — selected-element panel and filter result counts are unambiguous.
- [ ] **Type-page viewer needs object selection** — confirmed gap 2026-05-16 while diagnosing ghost objects. The Type page's `<InlineViewer>` lacks click-to-select; the user can't pick an unknown element to learn what class it is. Selection works in the Model dash + Federated viewer but not on the Types surface. Add the same selection→IFCPropertiesPanel flow as the Model dash.

### Drawings module

- [ ] **Gallery view + gallery/table toggle** — user verbatim: *"Each dwg and pdf should be shown in a gallery, and you should be able to toggle between gallery and table view."* The toggle pattern is system-wide per `gallery-table-toggle.md`.

### Point clouds

- [ ] **Point clouds as a file type** — extend `SourceFile` to ingest LAS/LAZ/E57 (already listed in CLAUDE.md "Supported/planned formats"). Self-contained point-cloud viewer in the Files module.
- [ ] **Point cloud underlay toggle in main viewer** — toggle on/off as a layer in the IFC viewer.

### Materials overhaul

- [ ] **Materials — breathing room + grid-based** — user verbatim: *"The materials page needs an overhaul. Give components space to breathe and set up the basic grid based approach."* Existing page uses PageShell + 2-column grid; needs density reduction and a strict grid baseline.

### EIR builder — "legit horrible" full overhaul

- [ ] **EIR builder visual + interaction rework** — user verbatim 2026-05-12: *"Legit horrible from a UI/UX perspective."* Track D polish landed but the page still reads dense / jittery card heights / preview xl-only. Phase 7 archive lift restores the broader EIR/BEP module; this is the *visual* finish. See `docs/plans/2026-05-12-15-44_Unified-UX-Audit-and-Redesign-Plan.md` § 3.8.

### Forward deployment + share

- [ ] **"Copy view link" button** — `?d=base64` URL roundtrip already encodes every filter dimension; share affordance is missing. Add to FilterChips on every dashboard. Paste a Sprucelab URL into existing client work → live filtered model intelligence. The marketing gateway drug.
- [ ] **Embed surface — dashboards in custom tools and websites** — user verbatim: *"hosting on sprucelab, but allowing humans or agents to display dashboards and data in other custom tools and websites. Webhooks etc."* Embed PRs 1-4 shipped (`fc16b1a`); PR 5 (ViewerTile + filter→isolation) onwards still queued. Webhook Phase 1 is live; webhooks-for-embed-events is the next layer.

### Type-page hero discipline

- [ ] **Type-page hero stays trimmed; pattern spreads** — recurring user note: components scaled bigger than they earn. Hero trimmed to `h-[clamp(420px,calc(100vh-22rem),720px)]` in Session 1 of the UX roadmap; re-verify on 1440×900 above the fold AND apply on every surface that lifted the Types template. 40-30-20-10 rule literally. See `feedback-types-page-hero-too-tall.md`.

### Pipeline

- [x] ~~Persistent Type-page viewer~~ — shipped 2026-05-15 (commit `8434672`)
- [ ] **Auto-trigger model analysis on upload** — `processing-complete` callback queues Celery task; no worker on Railway. Drop `.delay()` and run synchronously, or add a Railway worker service. Pick one, finish.

---

## Workbench surfaces

Per-entity work surface: source visible, proposals layered, new annotations added inline, accepted ones route or export.

| Entity | What the workbench needs to do | Status |
|---|---|---|
| Type | classify, substitute material, override property, annotate | Partial |
| Instance | property override, geometry annotation, attach issue | Missing |
| Material | LCA recommendation, substitution proposal, EPD link | Missing |
| Drawing (DWG/PDF) | zone annotation, label override, link to model element | Missing |
| Document | rule extraction (Claims), citation, promote to config | Partial |
| Storey | canonical-floor alias, name override, verification annotation | Partial |
| Opening | spec attach, build photo, as-built verification | Missing |

---

## Page coverage

| Surface | Route | Status | Note |
|---|---|---|---|
| Project gallery | `/projects` | Done | |
| Project dashboard | `/projects/:id` | Partial | EIR fulfillment ribbon, recent activity |
| Type page | `/projects/:id/types` | Done | persistent viewer shipped 2026-05-15 |
| Model workspace | `/projects/:id/models/:modelId` | Done | ViewerPane shell shipped 2026-05-15 |
| Models gallery | `/projects/:id/models` | Done | |
| Type library | `/projects/:id/type-library` | Partial | |
| Material library | `/projects/:id/material-library` | Partial | overhaul needed — breathing room, grid-based |
| Floors | `/projects/:id/floors` | Partial | |
| Drawings | `/projects/:id/drawings` | Partial | gallery view + gallery/table toggle missing |
| Documents | `/projects/:id/documents` | Partial | |
| Claims / inbox | `/projects/:id/claims` | Done | document-rule slice only; needs generalization |
| Issues | `/projects/:id/issues` | Missing | referenced from MyPage but route does not exist |
| Events | `/projects/:id/events` | Missing | Calendar + Gantt + Kanban + delivery table |
| Meetings | `/projects/:id/meetings` | Missing | sits in Project sidebar group |
| Teams | `/projects/:id/teams` | Missing | sits in Project sidebar group |
| EIR builder (admin) | `/projects/:id/admin/rules` | Missing | rules editor lives in project admin — limited visibility |
| EIR/BEP (front) | `/projects/:id/eir` | Partial | user-facing summary, broad visibility |
| Project admin | `/projects/:id/admin` | Missing | invite / assign / setup / rules editor host |
| Federated viewer | `/projects/:id/viewer/:groupId` | Done | viewer UX overhaul on the punch list |
| Workbench (mapping) | `/projects/:id/workbench` | Partial | mapping only; annotation primitive missing |
| Site map (GIS) | `/projects/:id/site` | Missing | top-down GIS view + viewer underlay |
| Point clouds | `/projects/:id/files/point-clouds` | Missing | self-contained viewer + viewer underlay |
| My Workspace | `/my-workspace` | Missing | cross-project; assigned issues, drafts, pins |
| Company workspace | `/companies/:slug` | Missing | org-owned, hard-separated from projects; templates + buckets |
| Field checklists | `/projects/:id/field` | Missing | aspirational; not finish-line |

---

## Deprecate or develop

Every accumulated piece of complexity gets a verdict. Default is NOT cut — it is **develop** (finish the build) or **deprecate** (keep, stop investing). Nothing sits in undefined limbo.

### Develop

- **Annotations / proposals primitive** — THE spine. Currently 1 slice (document-Claims → ProjectConfig). Needed across types / instances / materials / drawings / documents.
- **Issues primitive** — work tickets, manual + auto. Referenced from UI, not built.
- **Workbench surfaces** — spread the mapping-workbench pattern to Material / Instance / Drawing / Opening.
- **Pset writeback + fork model semantics** — close the annotation → export → IFC loop without violating model ownership.
- **Claims AI engine + LLM API key + agent framework** — drop-in API key + auto-trigger framework so Claims extraction actually runs against documents and site traffic.
- **Project rules editor + verification + GIS site map** — rules editor in project admin; user-facing EIR/BEP page; verification x/n in Model KPI; Type flag chips for non-compliance; GIS-style site map + viewer underlay.
- **Event module + Meetings + version-locking** — Calendar/Gantt/Kanban/delivery table; meetings module; track which versions were active at the time of an event.
- **Scopes (sub-project containers)** — Building A/B/C under one LBK project; lifecycle stages (early design / design / construction / handover).
- **My Workspace + Company Workspaces** — personal cross-project surface; org-owned container with WIP→Share gate, templates, buckets. Company-workspace ask is months old.
- **Project admin page** — invite / assign / setup; hosts rules editor (limited visibility).
- **Viewer UX overhaul** — HUDs, toolbars, section, annotation→issue, isolate/hide/color filter. The viewer is a tool, not the headline; bad viewer gets in the way.
- **Drawings gallery + gallery/table toggle** — per the system-wide gallery-table-toggle rule.
- **Point clouds** — file type + self-contained viewer + on/off layer in main viewer.
- **Materials overhaul** — breathing room, strict grid baseline.
- **Shareable filtered-view URL (`?d=`)** — encoder shipped, share button missing. Forward-deployed embed gateway drug.
- **Embed surface** — host on sprucelab, render filtered dashboards inside other tools. PR 5 onwards queued; webhooks-for-embed-events next layer.
- **EIR builder (visual + Phase 7 archive lift)** — grounds verification + classification.
- **Verification engine (full per-type ruleset)** — AnalysisStorey green/yellow ships. Develop incrementally.
- **LCA export — Reduzer-first** — Reduzer is the priority integration target. They own LCA reporting; Sprucelab cleans + verifies the data going in. Real-world relationship to leverage; design with this consumer in mind even before the integration ships.
- **TypeBank cross-project corpus** — foundational data, every ingest contributes. Read-side UI lags but pipeline writes stay.
- **Auto-analysis (Celery + worker)** — half-state today (`.delay()` queues, no worker consumes). Inline the call or add a Railway worker. Pick one and finish.

### Design-with-in-mind (no real work yet — relationships in the real world)

- **Reduzer** — LCA. Highest-priority partnership; design data shapes to flow cleanly into Reduzer's reporting.
- **Autodesk / Dalux / Solibri / Speckle / BCF servers** — coordination + clash + open-standard interop. Design for outbound IDS + BCF; inbound model sync is later.
- **Propely / Cobuilder / Diplom** — material + EPD + property registries. Same posture as Reduzer: design to interoperate; build when the relationship exists.

### Deprecate

- **Warehouse v1 (`TypeBrowser`, `TypeDashboard`)** — V2 mounted as canonical Types page. V1 folder kept as recovery hatch.
- **Field checklists module** — no nearby customer ask. Future construction-handover module.
- **Scripting + most of Automation UI** — Webhook Phase 1 (signed dispatch) stays. Pipeline / CDE / AgentRegistration UI deferred.
- **Marketplace for dashboards / rule packs** — long-term. Requires definition-driven dashboard engine first.

---

## Core concepts

Anchor principles. If a PR violates one of these, push back.

- **Files in → data streams out.** No file is an orphan. SourceFile (Layer 0) → ExtractionRun (Layer 1) → format-specific data (Layer 2) → cross-project intelligence (Layer 3).
- **Source is sacred; annotations live in Sprucelab.** The model is the source of truth. Sprucelab data accrues ON TOP without ever silently mutating the source. Export-as-pset always forks.
- **Modelers own the data; platform suggests + surfaces gaps.** Overview pages render raw values + amber em-dash for gaps. Never "Mapped %" framing. Platform proposals enter the proposal lifecycle, never overwrite.
- **Types are the unit of coordination.** A building has 50k entities but ~300 unique types. Sprucelab extracts and classifies types, never individual entities. Geometry stays in the viewer.
- **Agent-first, human-second.** Every operation is API-accessible with structured JSON. `dry_run` on every mutation.
- **Viewers persist, isolation drives state.** UnifiedBIMViewer mounts once per modelId; filter/selection mutates the isolation prop. Never remount on interaction.
- **Cross-filter is primary; DrillModal is secondary.** Click on a chart/chip/bar mutates the project filter (PowerBI pattern).
- **Dashboards view, workbenches annotate.** Two distinct surface types per entity.

---

## Reference

- **Feedback stream, May 16** — `docs/plans/2026-05-16_user-feedback-stream-finish-line.md` carries the full verbatim user stream that drives the current punch list (cross-filter regression, rules editor, events / meetings / version-lock, scopes, viewer UX, workspaces, point clouds, materials overhaul, integration posture).
- **UX audit, May 12** — `docs/plans/2026-05-12-15-44_Unified-UX-Audit-and-Redesign-Plan.md` carries five verbatim user observations (Models page, Model dash, Types page, Materials, EIR). Most resolved across the 8-session UX roadmap closeout (`docs/worklog/2026-05-12-19-00_UX-Roadmap-Closeout-Sessions-1-to-8.md`); the residue lives in the Punch list above.

---

## Recent shipping

- **2026-05-16** — Punch list expanded with the May 16 verbatim feedback stream: cross-filter regression P0, rules editor + verification + GIS map, sidebar reorg, events / meetings / version-lock, scopes, My / Company workspaces, project admin, viewer UX, drawings gallery, point clouds, materials overhaul, Reduzer-first LCA, integration design intent.
- **2026-05-16** — Frontend chore batch (commit `bcc973f`): QTO not-configured empty state (`use-script-execution` + `QTODashboard`), upload error UX with i18n strings (`UploadContext` + en/nb), Search nav button disabled with tooltip (`Sidebar` + en/nb), PlatformPanel eye-icon affordance.
- **2026-05-16** — `/dev` moved out of the webapp; now `docs/dev.md` (this file). Single source, no build cycle (commit `1919bf6`).
- **2026-05-15** — ViewerPane block + persistent Type-page viewer (commit `8434672`)
- **2026-05-15** — Vercel `/api` proxy regex fix; `/api/capabilities/` + `/llms.txt` live on www
- **2026-05-15** — Agent-first marketing pivot: `/agents` + `/benchmarks` + sprucelab-mcp
- **2026-05-15** — ifcfast 0.1.0 adoption gated behind `SPRUCELAB_PARSER=ifcfast` env flag

---

*Edit this file to update progress. Memory and `CLAUDE.md` point all sessions and agents here.*
