# Sprucelab — Dev

> **Canonical project tracker.** Every Claude session and every agent reads this file at session start. Edit this file to update progress; do not put the content anywhere else.
>
> **Finish line** = core flows work and feel sound, not optimized. The dashboards view; the workbenches annotate. Source models are sacred — Sprucelab data lives on top, never silently overrides. Aspirational modules wait. This file is the line.

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

### Spine

- [ ] **Annotations / proposals primitive** — new first-class entity. Target = any source data (Type material, Instance property, Drawing zone, Document statement). `proposed_value` JSON, status (proposed/accepted/rejected), `export_action` (none / pset-writeback / forks model). Parallel to Claims, distinct from Issues.
- [ ] **Issues** — referenced at `/projects/:id/issues?assignee=me` from MyPage cards but the route does not exist. Routed work tickets with assignee, status, priority, source ref. Auto-generated when verification fails / Annotation needs sign-off / Claim is rejected with action.
- [ ] **Pset writeback + explicit fork semantics** — exporting accepted Annotations as IFC psets creates a forked model with provenance. Source is never silently mutated. Required to close the annotation → export → IFC loop.
- [ ] **Workbench surfaces per entity** — dashboards view; workbenches annotate. Mapping workbench is the prototype. Pattern needs to spread to Material (LCA proposals), Instance (overrides), Drawing (annotations), Opening (lifecycle).

### Cross-filter "feels right"

- [ ] **Same-click toggles off** — verify on every dashboard surface (treemap, quality chip, storey bar, type chip, table row). Memory says this is the rule; confirm coverage.
- [ ] **Counts agree across tiles** — viewer subtitle "4 types · 73 instances" must equal treemap + KPI + table. Pick one source per dimension, eliminate drift.
- [ ] **Count-up animation everywhere** — Types page does it. Spread to Model dash KPI cluster, Materials, Project dash. The animation IS the signature.
- [ ] **Persistent viewer everywhere** — ViewerPane + isolation prop shipped on Type + Model dash (2026-05-15). Confirm Materials and Project dash do not remount on filter changes.

### Shareable views (forward-deployed gateway)

- [ ] **"Copy view link" button** — `?d=base64` URL roundtrip already encodes every filter dimension; share affordance is missing. Add to FilterChips on every dashboard. Paste a Sprucelab URL into existing client work → live filtered model intelligence. This is the marketing gateway drug.

### Pipeline

- [x] ~~Persistent Type-page viewer~~ — shipped 2026-05-15 (commit 8434672)
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
| Material library | `/projects/:id/material-library` | Partial | |
| Floors | `/projects/:id/floors` | Partial | |
| Drawings | `/projects/:id/drawings` | Partial | |
| Documents | `/projects/:id/documents` | Partial | |
| Claims / inbox | `/projects/:id/claims` | Done | document-rule slice only; needs generalization |
| Issues | `/projects/:id/issues` | Missing | referenced from MyPage but route does not exist |
| EIR builder | `/projects/:id/eir` | Partial | Phase 7 lift-from-archive pending |
| Federated viewer | `/projects/:id/viewer/:groupId` | Done | |
| Workbench (mapping) | `/projects/:id/workbench` | Partial | mapping flow only; annotation/proposal layer missing |
| Field checklists | `/projects/:id/field` | Missing | aspirational; not finish-line |

---

## Deprecate or develop

Every accumulated piece of complexity gets a verdict. Default is NOT cut — it is **develop** (finish the build) or **deprecate** (keep, stop investing). Nothing sits in undefined limbo.

### Develop

- **Annotations / proposals primitive** — THE spine. Currently 1 slice (document-Claims → ProjectConfig). Needed across types / instances / materials / drawings / documents. Without it the product is read-only.
- **Issues primitive** — work tickets, manual + auto. Referenced from UI, not built. Required for routing accepted Annotations and verification failures.
- **Workbench surfaces** — spread the mapping-workbench pattern to Material / Instance / Drawing / Opening.
- **Pset writeback + fork model semantics** — close the annotation → export → IFC loop without violating model ownership.
- **Shareable filtered-view URL (`?d=`)** — encoder shipped, share button missing. Forward-deployed embed gateway drug.
- **TypeBank cross-project corpus** — foundational data, every ingest contributes. Read-side UI lags but pipeline writes stay. Compounds value over time; do not stop writing.
- **EIR builder (Phase 7 lift-from-archive)** — grounds verification + classification. Treat as finish-line.
- **Verification engine (full per-type ruleset)** — AnalysisStorey green/yellow ships. Full per-type IDS validation is Phase 8 but the data path (Claims → ProjectConfig → verification) is in place. Develop incrementally.
- **LCA export (Reduzer / OneClickLCA)** — once Material workbench + annotation layer exist, mostly templating.
- **Auto-analysis (Celery + worker)** — half-state today (`.delay()` queues, no worker consumes). Inline the call or add a Railway worker. Pick one and finish.

### Deprecate

- **Warehouse v1 (`TypeBrowser`, `TypeDashboard`)** — V2 mounted as canonical Types page. V1 folder kept as recovery hatch; "Switch to classic" link rewires when needed. Don't delete until V2 has soaked across customer projects.
- **Field checklists module** — models specified, no frontend caller, no nearby customer ask. Future construction-handover module; do not invest now.
- **Scripting + most of Automation** — Webhook Phase 1 (signed dispatch) stays — in active use. Pipeline / CDE / AgentRegistration UI aspirational. Keep models, defer UI until automation epic.
- **Marketplace for dashboards / rule packs** — long-term vision. Requires definition-driven dashboard engine first. Off the table until v1 is shipped and someone is using it.

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

## Recent shipping

- **2026-05-16** — Frontend chore batch (commit `bcc973f`): QTO not-configured empty state (`use-script-execution` + `QTODashboard`), upload error UX with i18n strings (`UploadContext` + en/nb), Search nav button disabled with tooltip (`Sidebar` + en/nb), PlatformPanel eye-icon affordance.
- **2026-05-16** — `/dev` moved out of the webapp; now `docs/dev.md` (this file). Single source, no build cycle (commit `1919bf6`).
- **2026-05-15** — ViewerPane block + persistent Type-page viewer (commit `8434672`)
- **2026-05-15** — Vercel `/api` proxy regex fix; `/api/capabilities/` + `/llms.txt` live on www
- **2026-05-15** — Agent-first marketing pivot: `/agents` + `/benchmarks` + sprucelab-mcp
- **2026-05-15** — ifcfast 0.1.0 adoption gated behind `SPRUCELAB_PARSER=ifcfast` env flag

---

*Edit this file to update progress. Memory and `CLAUDE.md` point all sessions and agents here.*
