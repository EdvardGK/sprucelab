# Embed Roadmap — PR 5 and onward

**Status:** backlog for the next embed work session
**Mission:** forward-deployed embeddable dashboards (2026-Q2)
**Predecessor plan:** `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md`
**Memory anchors:** `forward-deployed-embed-mission`, `speckle-powerbi-robustness-lesson`, `single-project-filter-store-bidirectional`

---

## Mission recap

Sprucelab is extracting a read-only api/cli/dashboard subset that Sprucelab itself hosts and arbitrary external sites can embed. The first external consumer is **skiplum-pages** — a GitHub Pages site that already does layout work for the Skiplum dashboard family. The unit of embedding is a **page** rendered at `/embed/:dashboard`, not a tile, and the transport is **iframe + postMessage** with strict origin allowlists. The architecture is non-negotiable: a viewer crash or OOM inside the embed must not be able to take down the host page, which is why iframe-process isolation is in the contract instead of a JS-SDK-of-tiles. Filter state inside the embed is intentionally **separate** from the in-app `ProjectFilterProvider` — the embed runs its own `DashboardFilterProvider` driven by the postMessage envelope, not the parent app's Zustand/context tree.

## PRs 1–4 shipped

| PR | Commit | What landed |
|----|--------|-------------|
| 1 | `0a253dc` | Plan doc + CONTRIBUTING.md + CI scaffold (forward-deployed embed plan committed to repo). |
| 2 | `f72ad6e` | `DashboardFilterProvider` + filter context types + URL serialization (`frontend/src/lib/embed/*`, `dashboard-primitives/MetricCard`). Pure types/provider — no UI integration. |
| 3 | `1581826` | `/api/embed/instances` resolver + `/api/embed/capabilities` manifest. Semantic→concrete type-id resolution, 2500-instance truncation, floor_code via `AnalysisStorey`/`AnalysisTypeStorey`. Dropped `instance_express_ids` from response shape; viewer derives them locally. |
| 4 | `fc16b1a` (merged via PR #6) | Scoped token auth plane — `EmbedToken` model, `EmbedTokenAuthentication` (`Authorization: Embed <raw>`), capability gates, `/embed/:dashboard` Vite route with postMessage harness, `spruce embed pass {create,list,revoke,refresh}` CLI. 51 new unit tests. |

The auth + transport plane is therefore complete. PR 5 is the first PR where a real tile renders inside the iframe.

## PR 5+ candidates

### PR 5 — ViewerTile + filter→isolation wiring

**Scope.** Wrap `UnifiedBIMViewer` as a `DashboardFilterProvider` consumer. The embed receives `set_filter` over postMessage, the provider holds the resulting `FilterContext`, and the viewer subscribes — converting `type_id[]` (from `/api/embed/instances/`) into the `isolation` prop the viewer already accepts. Also introduce the highlight/filter mode toggle: filter = isolate (existing behavior), highlight = ghost mesh + accent on selected with the rest dimmed.

**Dependencies.** PR 4 (auth + iframe page) and PR 3 (resolver) are both live. Highlight-rendering mode needs the spike that was tagged for omarchy in the Q-pass — confirm whether that ever ran; if not, run it before committing to ghost-mesh vs transparency.

**Risk.** Medium. This is where the robustness contract gets tested for the first time end-to-end: hard memory budget per scene, `webglcontextlost` recovery, explicit teardown on iframe navigation. The 100% Speckle PowerBI crash is the exact failure mode this PR has to refuse.

**First consumer.** A test embed page served by `vite dev` — the dashboard renders only the ViewerTile, hand-fed a hard-coded `FilterContext`. skiplum-pages does not consume this PR directly; PR 10 wires that.

### PR 6 — TypeBrowser tile + cross-filter loop

**Scope.** First non-viewer tile inside the embed. TypeBrowser as a chart-shaped tile that both reads from the embed's `FilterContext` and emits writes when the user clicks a type. End-to-end demo of the bidirectional cross-filter loop: click a type in the tile → viewer isolates that type → click a wall in the viewer → tile filters to that type. PowerBI parity demonstrated.

**Dependencies.** PR 5 (ViewerTile must exist for the loop to close). Reuses `MetricCard` shell from PR 2 if the tile needs summary cards.

**Risk.** Medium. Selection-from-viewer requires the viewer to emit a `selection_changed` postMessage (envelope already typed in PR 4), and the host iframe needs to translate the express_id back into a `type_id` via the ThatOpen fragment data it already holds. The translation lookup is non-trivial.

**First consumer.** Same in-repo dev embed page as PR 5, now with two tiles.

### PR 7 — Robustness pass

**Scope.** The robustness contract items from the plan doc that weren't already covered by PR 4 + PR 5: hard memory budget enforcement (default 1 GB GPU + 1 GB RAM, page out by LOD above the cap), per-tile error bubble isolation, filter-change backpressure (debounce + last-write-wins), bounded concurrent query budget (default 6 across all tiles), telemetry beacon endpoint for memory pressure / WebGL loss / fragment timeout / origin rejection, and the memory-leak smoke test (open → nav away → nav back × 20, assert <10% heap growth).

**Dependencies.** PR 5 and PR 6 must be merged so there is a real viewer + non-viewer tile to enforce the contract against.

**Risk.** High blast radius but low surprise. Each contract item is well-defined; the work is in cross-cutting wiring. The telemetry beacon endpoint is the only piece that adds a new public surface (`POST /api/embed/telemetry/`) and needs to honor the same scoped-token auth.

**First consumer.** Same in-repo dev embed harness; verified via deliberate kill-the-tab / mash-the-filter manual tests.

### PR 7a — `quality.*` filter dimension + ModelQualityIssue

**Scope.** Make "untyped walls", "orphan geometry", "empty containers", "missing pset" first-class filterable data. New `apps/entities/models/quality.py::ModelQualityIssue` (Q-pass settled this location), the migration that follows `0039`, the detector hooks inside the existing extraction passes that emit issues (not new infra — instrument what's already there), the resolver wiring so `FilterContext.quality.untyped: true` scopes the `/api/embed/instances/` response, and the four MVP quality tiles (one per issue type from the Q10 settlement).

**Dependencies.** Independent of PR 5/6/7 at the data layer (could land in parallel), but the dashboards in PR 8 depend on it.

**Risk.** Medium. This is where the "bad models are the product" principle gets implemented; the detector hooks must be additive — they do not change extraction behavior on the happy path, they only record. Confirm the detection coverage matrix (Q10) before locking the migration.

**First consumer.** PR 8's Requirements Fulfillment dashboard reads from `ModelQualityIssue`; the existing TypeBrowser tile gets a quality-filter chip.

### PR 8 — Requirements Fulfillment dashboard

**Scope.** First MVP dashboard. ISO-19650 shape: "X of Y EIRs fulfilled" + a list of `InformationRequirement` rows, each with a status, fulfilled/total counts, and a drill-in. Quality tiles (untyped, orphan, empty container, missing pset) live **inside the requirements they violate**, not as standalone metrics. No `health_score` (deliberately — see `feedback-iso19650-requirement-fulfillment` memory). Viewer tile added so EIR-gap drill-in highlights the offending geometry.

**Dependencies.** PR 7a for the quality data; PR 5/6 for the tile composition; and the ISO 19650 framework plan at `docs/plans/2026-05-03-21-30_ISO19650-Framework.md` for the `InformationRequirement` + `RequirementFulfillment` domain models. PR 8 cannot ship before those models exist.

**Risk.** Medium-high. Largest user-facing surface in the embed track; design lock is needed from the user before code starts.

**First consumer.** skiplum-pages eventually; in-repo dev embed first.

### PR 9 — Floors Overview dashboard

**Scope.** Reframe the existing F-3 floors work as a dashboard. Floor table with deviation badges, viewer tile that isolates the selected canonical floor, drill-down to type-by-floor. Smaller than PR 8 because most of the backend (canonical floors, `AnalysisStorey`) is already in place.

**Dependencies.** PR 5 (viewer tile) and PR 6 (cross-filter loop pattern).

**Risk.** Low. Reuses existing analysis tables and the canonical-floor end-to-end work.

**First consumer.** skiplum-pages eventually; in-repo dev embed first.

### PR 10 — skiplum-pages integration

**Scope.** First real external consumer. Drop a `/embed/:dashboard?token=...` iframe inside the skiplum-pages GitHub Pages site, behind a real scoped token issued via `spruce embed pass create`. Exercise the postMessage bus, origin allowlist, and refresh path in a live browser session against the production embed surface. Confirms that the "live iframe handshake test" deferred from PR 4 actually works.

**Dependencies.** Everything above. Also the skiplum-pages side: the `dev/embed-host.html` Q6 work and the `--push-gh-pages` adapter (which lives on the edkjo box per the mission memory).

**Risk.** Highest in the sequence — first real cross-origin / cross-deploy contact. Mitigated by the fact that everything below it has been exercised against an in-repo harness already.

**First consumer.** skiplum-pages. By construction.

## Open questions

1. **Highlight-mode spike** — did the omarchy ghost-mesh-vs-transparency experiment ever run? PR 5 cannot lock the rendering approach without it. (See plan-doc Q5; tagged for omarchy in the 2026-05-04 Q-pass.)
2. **Dev iframe harness** — should the repo grow a `dev/embed-host.html` that iframes `localhost:5173/embed/:dashboard` for inner-loop dev, or does that live only in skiplum-reports (Q6 settled it there)? If only there, omarchy needs a checkout of skiplum-reports to test PR 5/6 locally.
3. **Telemetry destination (PR 7)** — does the embed telemetry beacon write into a new Django app (`apps/embed_telemetry/`), extend `ExtractionRun.processing_log`, or push to an external sink? Plan-doc Robustness §10 says "back to Sprucelab via a beacon endpoint" but doesn't pick a storage shape.
4. **Token rotation policy** — PR 4 ships a 5-minute grace window on refresh. Does the host page rotate on a schedule (e.g. every 50 min for a 60-min TTL) or only on `401`? Policy lives in skiplum-pages' adapter, not in sprucelab, but sprucelab should publish the recommendation.
5. **Domain allowlist source-of-truth** — allowed origins are set per-token at issuance. Is there ever a global allowlist (env var on Railway), or is per-token sufficient? Plan-doc §Auth says CORS allowlist is per-token; verify Railway's `CORS_ORIGINS` doesn't need to mirror.
6. **Save-filter-as-view inside the embed** — Q8 settled it as "first PR after MVP". Confirm whether that means after PR 10 (skiplum-pages live) or after PR 9 (last MVP dashboard). Affects PR 10's scope.
7. **Capability negotiation for unknown filter dimensions** — when a host iframe sends a `set_filter` with a dimension the resolver doesn't recognize, do we reject the message, ignore the unknown key, or echo `skipped_filters` back via postMessage? Resolver already does the latter for HTTP; postMessage path is unspecified.
8. **Truncation-threshold per-project override** — Q2 settled the default at 2500 with per-project override. Where does the override live — `ProjectConfig`, a new `EmbedConfig`, or a column on `EmbedToken`? PR 7 is the natural place to wire it.

## Anti-goals

- **No 3D in the host process.** No web component, no JS-SDK-of-tiles, no React widget that gets loaded into the parent page. iframe + postMessage is the architecture; the Speckle PowerBI crash is the canonical lesson.
- **No write capabilities for v1.** Reads only and `dry_run` previews. The auth plane ships `read:dashboards / read:types / read:instances` capabilities; nothing else.
- **No universal embed framework abstraction.** The embed is a concrete `/embed/:dashboard` route with two-to-five dashboards, not a no-code tile authoring system or a multi-tenant white-label engine. Tiles are React components in this repo.
- **No coupling to the in-app filter store.** `ProjectFilterProvider` is for the main app at `/projects/:id/*`; the embed runs `DashboardFilterProvider`. They are intentionally separate; tile components consume the shape, not the source.
- **No mobile-first viewer.** Mobile path hides the viewer below 600px (Q7 settled it). Don't try to make the viewer tile responsive; make the dashboard layout responsive without it.
- **No `health_score`.** Requirements Fulfillment reports `X of Y EIRs met` with drill-in. Quality issues are gaps against specific requirements, not a standalone composite score.
- **No premature shared state with non-embed routes.** Tile components can live in `frontend/src/components/dashboard-primitives/` and be reused by the in-app dashboard, but their state contract is the `FilterContext`, not the `ProjectFilterProvider` instance.

---

## Sources

- Repo plan: `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md` (PR sequence, robustness contract, open questions, MVP dashboard list)
- Repo worklogs read for this roadmap: `2026-05-04-16-10_Embed-PR3-Resolver-Endpoint.md`, `2026-05-04-22-50_Embed-PR3-and-Landing-Editorial-Architecture.md`, `2026-05-05-19-03_Embed-PR4-Scoped-Tokens-And-Iframe-Page.md`, `2026-05-10-21-54_Coordinator-Round-2-Five-Tracks.md`
- Git anchors: `0a253dc`, `f72ad6e`, `1581826`, `fc16b1a`
- `~/.claude/plans/` hits relevant to embed: `whats-next-lovely-tome.md` (PR 2 plan), `whats-next-fluttering-duckling.md` (PR 4 ship plan). No PR 5+ implementation plan exists in `~/.claude/plans/` — the master sequence lives in the repo plan above. This roadmap synthesizes from that sequence + the shipped worklogs + the three mission memories.
- Memories: `forward-deployed-embed-mission`, `speckle-powerbi-robustness-lesson`, `single-project-filter-store-bidirectional`, `feedback-iso19650-requirement-fulfillment`, `feedback-bad-models-are-the-product`, `feedback-keep-layouts-simple`
