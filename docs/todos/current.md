# Current TODO - Sprucelab BIM Platform

**Last Updated**: 2026-05-10 (post Coordinator Round 2)
**Current Phase**: Frontend refresh — Phase 1 COMPLETE, Phase 3 next
**Status**: 194 unit tests green. Trunk-based: all merges direct to `main`.

---

## Recently shipped

- [x] **Phase 3 Type page v2 — full dashboard polish** (2026-05-11, commits `e41c272` → `4cfb5d3`, 24 commits total) -- Last twelve added in an autonomous overnight round: DashboardGrid 4-col primitive adoption; clamp() everywhere; sparklines under every KPI with per-IFC-class distribution; status-dot column on table rows (traffic light); live "Updated Xs ago" pulse in header; Phase 3b detail panel (classification + key properties + layer buildup + Pset explorer); v3 fragments viewer null-camera fix; treemap cross-filter; Top-10 + table IFC-class cross-filter with clear-filter pill; shared ifcClass→color map binding treemap + sparklines + table row stripes; empty-state clear-filters CTA. Three input surfaces converge on one ifcClassFilter (Linear/PowerBI pattern).
- [x] **Phase 3 Type page v2 — final shape** (2026-05-11, commits `e41c272` → `fba012d`) -- new `/projects/:id/types?v=2` shipped + iterated through 7 commits to final 3-row layout: row 1 = 6-KPI traffic-light grid (Total · Instances · Avg/type / Untyped · Orphan · Missing classification, with amber/red rings + value coloring on threshold), row 2 = treemap (aspect-square) + 3D viewer (aspect-[4/3]) at 50/50 width with click-row-to-isolate, row 3 = Top-10 bar chart (25%) + types table (75%) at h-[640px] with sticky thead and internal scroll. Property columns full-worded (Load-bearing · External · Fire rating · Acoustic rating · U-value · MMI) extracted via tolerant Pset_*Common probe at `warehouse-v2/typeProperties.ts`. Reframe: "modelers own the data, platform suggests + surfaces gaps" — no "Mapped %" framing, missing values render as amber em-dash. v1 untouched.
- [x] **Webhook System Phase 1** (2026-04-29, snapshot `b73a1d5`) -- `WebhookSubscription` + `WebhookDelivery` in `apps/automation/`, HMAC-SHA256 dispatcher, Celery `deliver_webhook_task` with exponential backoff + auto-disable, ViewSets at `/api/automation/webhook-{subscriptions,deliveries}/`. Four events wired: `model.processed`, `document.processed`, `claim.extracted`, `verification.complete`.
- [x] **CLI Expansion -- spruce {types,verify,scripts}** (2026-05-10, commit `991cce9`) -- Typer + Rich + httpx (mirrors `embed.py`). All commands support `--json`. Entry point `cli/spruce/cli.py`. Backend quirks documented: `verify` is POST not GET; `types classify` uses bulk-update with single-element mappings; `types export` streams binary to stdout.
- [x] **PR 1.5 SavedFiltersDropdown** (2026-05-10, commit `e2f7b0c`) -- `useSavedFilters` hook + Radix dropdown UI mounted in `CanvasOverlays.tsx` chip row. Restore semantics = full replace via `useProjectFilterActions.replace()`. i18n keys `filters.saved.*` (en + nb with proper æøå).
- [x] **PR 1.4 SavedFilter backend** (2026-05-10, commit `95c4b50`) -- `apps/filters/` with six models, scope-aware ViewSets at `/api/filters/{saved,libraries,pinned,announcements}/`, 18 unit tests. TODO: swap `owner_company` CharField -> FK when Phase 7 org model lands.
- [x] **PR 1.3b ModelWorkspace cross-filter** (2026-05-10, commit `0cf9e83`) + **Track H DrillTarget `style?:` prop** (2026-05-10, commit `dba3932`) -- treemap + GeometryBar segments now use `<DrillTarget>` instead of hand-rolled `role="button"` blocks.
- [x] **Phase 2 Drawings + Documents wiring** (2026-05-10, commit `35ed867`) -- real `ProjectDrawings.tsx` + `ProjectDocuments.tsx`, `dxf-viewer` + `react-pdf` deps, ClaimInbox rehoused at `/projects/:id/claims`. Vite opentype.js fix-forward in `ae397a9`.
- [x] **Phase 1 PR 1.3 DrillTarget + FilterChips demote** (2026-05-10, commit `1f2f3a6`)
- [x] **ifc-service OOM detection** (2026-05-10, commit `6837c6b`) -- `_classify_subprocess_failure` distinguishes SIGKILL/OOM (`returncode in (-9, 137)`) from generic failures, emits structured logs. Pairs with Django-side sweep-on-read recovery (`04d61dd`).
- [x] **Django sweep-on-read fragments recovery** (2026-05-10, commit `04d61dd`) -- `fragments_status` flips `'generating'` -> `'failed'` after `FRAGMENTS_GENERATION_TIMEOUT` (10m default).
- [x] **Vercel pinned to Corepack Yarn 4** (2026-05-10, commit `1219b83`) -- `frontend/vercel.json` `installCommand` runs `corepack enable && corepack prepare yarn@4.12.0 --activate && yarn install --immutable`. Round 1 Vite opentype.js alias stays as defensive fallback.
- [x] **F-1/F-2/F-3 canonical floors end-to-end** (2026-04-30 -> 2026-05-01) -- `ProjectScope.canonical_floors`, `storey_list` claim + promotion, `check_storey_deviation` engine rule, publish gate, frontend StoreyListClaimPanel + Floors tab + viewer floor-code wiring.
- [x] **Embed PRs 1-4** (through 2026-05-05) -- plan doc, DashboardFilterProvider, `/api/embed/instances/`, scoped tokens + iframe page. Branch `feat/embed-scoped-tokens-iframe` squash-merged as `fc16b1a`, dead branch already deleted from origin.

---

## Active backlog

### Phase 3 -- Type page v2 (dashboard polish shipped; follow-ups remain)
- [x] Phase 3 first cut + 19 iteration commits (last commit `4cfb5d3`)
- [x] **Phase 3b — detail panel** shipped 2026-05-11 (`c0b704d`)
- [ ] **Phase 3b.1**: Polish bottom-row KPI sparklines (Untyped/Orphan/Missing) — render but visually subtle. ~10 lines: `mt-auto` or inline subValue
- [ ] **Phase 3b.2**: URL persistence of `ifcClassFilter` + `selectedTypeId` via `useSearchParams` (~30 lines, matches `?v=2` pattern)
- [ ] **Phase 3b.3**: Flag this type → create `Claim`. Backend `POST /api/types/claims/` + frontend `useCreateClaim` mutation + UI action in detail panel. Multi-stack
- [ ] **Phase 3c**: Dedicated type-workspace route at `/projects/:id/types/workspace?type=:id` — modeler-style manual classification UI lives there (currently still in v1 `TypeBrowser` 3-column form). Per `feedback-modelers-own-data-platform-suggests.md`
- [ ] **Phase 3d**: Cards view toggle
- [ ] **Phase 3.x**: Materials port at `/projects/:id/materials?v=2`
- [ ] MMI distribution per type — needs per-instance aggregation (new `useTypeMmiDistribution(typeId)` hook + likely a new backend endpoint)
- [ ] Confirm "Orphan" semantic with user: currently = types with `instance_count === 0`; might mean orphan entities (no spatial hierarchy) instead
- [ ] Notes per type — simple textarea in detail panel (independent of Claim system)
- [ ] Plausible analytics events for v2 (filter set, type selected, detail opened) — ~10 lines

### CLI follow-ups
- [ ] Live API smoke against dev server: `spruce types list --model <id> --json`, `spruce verify --model <id>`, `spruce scripts list`. Only `--help` verified at ship time.

### Embed surface
- [x] PR 1: Plan doc + DashboardFilterProvider stub (`fc16b1a`)
- [x] PR 2: DashboardFilterProvider live -- filter context types, provider, URL serialization (`fc16b1a`)
- [x] PR 3: `/api/embed/instances/` resolver -- semantic->concrete + truncation logic + `/api/embed/capabilities` (`fc16b1a`)
- [x] PR 4: Scoped token middleware + iframe page route -- `/embed/:dashboard`, postMessage handshake, origin allowlist (`fc16b1a`)
- [ ] PR 5: ViewerTile + filter->isolation -- `UnifiedBIMViewer` as filter-context consumer, resolver-driven isolation, highlight/filter toggle. Design in `docs/research/2026-05-10-22-37_Viewer-Highlight-Mode-Spike.md`; scaffold landing in Round 5 Track U; real-model spike (transparency artifacts, perf, multi-model coord) pending omarchy session
- [ ] PR 6: TypeBrowser tile + cross-filter loop -- full bidirectional filter loop with one chart-shaped tile; end-to-end demo
- [ ] PR 7: Robustness pass -- items 2-10 from robustness contract not yet covered (memory cap, leak smoke test, telemetry beacon, degraded mode, etc.)
- [ ] PR 7a: Model-quality dimension -- `quality.*` filter keys, `ModelQualityIssue` store (or `ExtractionRun` extension), resolver scoping, quality tiles; gates dashboard 1
- [ ] PR 8: Requirements Fulfillment dashboard -- first MVP dashboard (depends on ISO 19650 framework plan)
- [ ] PR 9: Floors Overview dashboard -- second MVP dashboard
- [ ] PR 10 (final): skiplum-pages integration -- real embed inside skiplum-pages behind a scoped token; per memory `forward-deployed-embed-mission`

> Roadmap source: [docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md](../plans/2026-05-03-21-15_Forward-Deployed-Embed.md)

### Filter system follow-ups
- [ ] Replace `is_staff` fallbacks in `apps/filters/views.py` when Phase 7 org model + company-admin role types land
- [ ] Swap `owner_company` CharField -> FK to `accounts.Company` (same trigger)
- [ ] Library + Pin + Announcement UI (PR 1.4 only shipped SavedFilter consumer; the other three model surfaces still have no frontend)

### Phase 2 (Drawings/Documents) follow-ups
- [ ] PR 2.3 -- permissions gating on Drawing/Document/TitleBlock ViewSets
- [ ] PR 2.4 -- DWG -> DXF conversion via LibreDWG
- [ ] DXF viewer primitive toggle + color override (memory: `dxf-viewer-feedback.md`)

### Verification + dashboards
- [ ] Replace `health_score` with ISO 19650-style requirement fulfillment ("X/Y EIRs fulfilled") per memory `feedback-iso19650-requirement-fulfillment.md`
- [ ] BCF export from verification failures
- [ ] Rule Configuration GUI (visual rule builder)

### Agent-ready platform
- [ ] Webhook UI -- backend Phase 1 is live, but there's no frontend to manage subscriptions/deliveries
- [ ] Dry-run support on remaining mutations (currently only `type-mappings/bulk-update/` + `type-definition-layers/bulk-update/` + claim actions support `?dry_run=true`)

### Infra / DX
- [ ] Frontend unit-test runner (vitest) -- memory `feedback-frontend-no-unit-tests.md`. Until then, frontend verification = `tsc --noEmit` + `yarn build` + Vercel commit-status.
- [ ] `UnifiedBIMViewer` chunk size warning -- 4.7 MB raw / 896 KB gzipped. Pre-existing, surfaces on every build.

---

## Parked / deferred

- **Viewer perf + visual rework** -- per memory `feedback-viewer-perf-rabbithole.md`. Diagnose when asked, stop at diagnosis. Multi-stack viewer fixes (properties sidecar, AO, hider perf) wait for Phase 4 or explicit ask.
- **Sprint 6.3 LLM claim extraction** -- PINNED. Do not start without real inbox-quality data + explicit cost/policy approval. Hooks in place: one-file change to `claim_extractor.py` + per-project flag when ready.
- **ThatOpen lodSize bug** -- documented elsewhere; not blocking. Park alongside other viewer perf work.
- **Phase 7 org model + EIR/BEP module + auto-classification (LLM)** -- unblocks the `is_staff` -> role-type swap in `apps/filters/`.
- **Phase 8 Schedule + Meetings + thumbnails + pluggable classifications**

---

## Phase 2 (legacy) backlog -- still relevant

- [ ] Auto-classification suggestions (TypeBank ML) -- depends on Phase 7
- [ ] Design scenario comparison (A/B/C LCA)
- [ ] EPD Architecture Phase 2-4 (ProjectConfig inheritance, EPD browser UI)
- [ ] MMI extraction
- [ ] Measurement rules per IFC class
- [ ] Reduzer product seeding

---

## Deprioritized

- BEP System (over-engineered, ProjectConfig sufficient -- archived)
- Full property editing (Excel workflow sufficient)
- Graph queries (over-engineered for MVP)
- Clash detection (Solibri's moat)
- Standalone viewer features (viewer serves data, not standalone)

---

## Known issues

1. **`UnifiedBIMViewer` chunk size**: 4.7 MB / 896 KB gzipped. Pre-existing build warning; not blocking.
2. **Dashboard health at 0%** for new projects: types pending classification (expected).

---

**Next Action**: Phase 3b -- Detail pane on type row click (classification triple + properties grid + layer buildup; viewer isolation already works)
**Then**: Phase 3b.1 (notes + Flag-this-type → Claim), Phase 3c (dedicated type workspace), Phase 3.x (Materials port), Embed PR 5+
