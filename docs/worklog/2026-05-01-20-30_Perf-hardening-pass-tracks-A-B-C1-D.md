# Session: Perf hardening pass — frontend hotfix + backend N+1 + Postgres index + dev profiler

## Summary
Audited the past week of "hardening" work and confirmed perf was not a design concern (zero mentions of perf/slow/cache/N+1 across recent worklogs; two slow paths acknowledged and deferred). User raised speed to a product principle ("users come for the business problems we solve and stay for the speed, smoothness, and attention to detail") and approved a multi-track plan. This session shipped Tracks A, B, C1, and a Track D foundation. Track C2 (viewer Web Worker) explicitly deferred — full ThatOpen → OffscreenCanvas migration is library-fork territory, not a one-session task.

## Changes

### Track A — Frontend hotfix
- `frontend/src/App.tsx` — converted all 23 routes to `React.lazy()` + `Suspense`. **Login bundle dropped from 1,634 KB → ~200 KB gzipped (8× smaller first paint)**. Static `import ModelWorkspace`/`FederatedViewer` was pulling the entire ThatOpen 3D engine into every page including login/projects.
- `frontend/src/components/features/viewer/InlineViewer.tsx` — wrapped with `React.memo`, `console.log('[InlineViewer]', …)` gated behind `import.meta.env.DEV`.
- `frontend/src/hooks/useInstanceProfile.ts`, `useInstanceGeometry.ts` — added `gcTime: Infinity`, `retry: false`. Stops 404 retry storms on viewer preview lookups (visible in user's original console output).
- `frontend/src/hooks/useInstanceDetail.ts` — `retry: false`.
- 10 ungated `console.log/debug/info` calls swept across `Sidebar.tsx`, `UnifiedBIMViewer.tsx`, `HUDScene.tsx`, `ifc-service-client.ts` — all gated behind `import.meta.env.DEV`. Three of these (`[HUDScene] Section setup`, `[HUDScene] Profile outline built`, `[HUDScene] Sandwich diagram built`) were visible in the user's original console output and fired on every viewer mount.

### Track B — Backend N+1 fixes
- `backend/apps/projects/views.py::_get_top_types` — collapsed loop with 3N queries into a single annotated query using `Count('assignments')` + `Sum('assignments__entity__{volume,area,length}')`. TypeAssignment is unique on `(entity, type)` so the JOIN doesn't double-count.
- `backend/apps/projects/views.py::_get_top_materials` — 2 queries (annotated count + bulk distinct-pair fetch with Python aggregation) down from 3N. MaterialAssignment is `unique_together = (entity, material, layer_order)` so a material can have multiple rows for the same entity at different layers — kept the original "distinct entity volume" semantics by deduping in Python.
- `backend/apps/projects/views.py::floors` — bulk-fetches latest `storey_list` claims per source_file via Postgres `DISTINCT ON (source_file_id)`, passes the relevant claim into `check_storey_deviation` to skip the inner DB lookup. Added `select_related('source_file', 'scope')`. Was 1+3N queries; now ~3.
- `backend/apps/entities/services/verification_engine.py::check_storey_deviation` — accepts new optional `claim=` kwarg with sentinel default. Bulk callers hand in pre-fetched claim; single-arg callers (publish gate, types view) keep original behavior.
- **Audit was wrong about `claim_issue_resolver.py`**: file already had `.select_related('ifc_type__model')` on mappings and `.select_related('document__source_file')` on Claim fetch. No change needed; trust-but-verify saved a pointless edit.

### Track C1 — Postgres index
- `backend/apps/entities/models/claims.py` — added composite index `(source_file_id, claim_type, -extracted_at)` named `claims_sf_type_extracted_idx`. Migration `entities/0039` generated and applied to dev DB.
- Index serves both the bulk `DISTINCT ON` in `floors()` and the per-call latest-claim fetch in single-arg `check_storey_deviation` with an index-only scan (Postgres can satisfy ORDER BY directly from the index).

### Track D — Instrumentation foundation
- `backend/apps/core/middleware.py` (new) — `QueryCountProfilerMiddleware`. Append `?profile=1` to any DRF URL; response gains `X-DB-Query-Count`, `X-DB-Query-Time-Ms`, `X-Total-Time-Ms`, and `Server-Timing: db;dur=` headers. Chrome devtools' Network → Timings panel reads `Server-Timing` natively. Zero overhead when not profiling. DEBUG-gated by default; `PROFILE_QUERIES=True` enables in any env.
- `backend/config/settings.py` — middleware wired into `MIDDLEWARE`.
- `docs/knowledge/perf-budgets.md` (new) — living budget doc. Endpoint targets with status (✓ enforced via regression test, or TODO), frontend route budgets (with 8× login-bundle drop logged as evidence), console-hygiene budget, network-hygiene budget. Bar for raising any number is a justified change, not "we picked up an extra dep".

### Tests
- `tests/unit/test_query_counts.py` (new) — 2 regression tests using `CaptureQueriesContext` to assert query count is the same for N=1 vs N=10/20. Catches future N+1 regressions without locking to a brittle exact count. **All 196 unit tests pass** (was 194; +2 new).

## Technical Details

### Why "rewrite in Rust/Go/Zig" was the wrong first move
User raised speed mandate and explicitly opened the door to native rewrites. Pushed back honestly: the actual bottlenecks (React re-render churn, Django ORM N+1, missing Postgres indexes, 1.6 MB login bundle) don't get faster in another language — they get faster by fixing the actual code. Memory saved (`feedback-speed-smoothness-quality-bar.md`) capturing the principle: "Recommend native rewrites only when profile data justifies them. Lead with highest-ROI move, which is usually fixing existing code."

### Why route-level lazy loading was the biggest single win
Build output before fix: one chunk, 7,450 KB / 1,634 KB gzipped. Login statically pulled in `ModelWorkspace` → `UnifiedBIMViewer` → ThatOpen → entire 3D engine. After fix: 30+ chunks; login is `index-Codx6yKg.js (200 KB gz) + Login-9TU7YVvp.js (1.21 KB gz)`; the heavy `UnifiedBIMViewer-D8SQH7SB.js (881 KB gz)` chunk only loads when a user actually opens a model. Per-page wins: Login 8.1×, TypeLibraryPage ~5×.

### N+1 trick: parity test instead of pinning exact query count
DRF middleware queries shift between releases. Instead of `assertNumQueries(N)`, the regression tests build two scenarios (1 model vs 10 models) and assert query count is the *same*. If query count grows with N, an N+1 has reappeared. Independent of exact count, robust to middleware changes.

### Sentinel default for backwards-compat in verification_engine
`check_storey_deviation(model, *, claim=_UNSET)` — using a module-level sentinel object as the default lets callers explicitly pass `claim=None` to mean "no claim available, return []" while existing callers that just pass `model` get the original DB-fetch behavior. Cleaner than `claim: Claim | None = None` (which conflates "not provided" with "explicitly None") or split functions.

## Next
1. **Browser-verify Track A** — deploy the branch (or `just dev`) and confirm: `[InlineViewer]` log gone in prod, login bundle smaller in Network tab, no `setTimeout`/`rAF` violations during type browsing.
2. **Commit + push** the 17 files (13 modified, 4 new). Migration `entities/0039` needs to run on prod DB.
3. **Profile real endpoints** with `?profile=1` and Chrome perf trace once deployed; populate the aspirational numbers in `perf-budgets.md` with measured baselines.
4. **Track C2 (viewer Web Worker)** if main-thread blocking persists after Track A's churn fix is verified — but profile FIRST. Don't speculate.
5. **Optimistic mutations** for the type classification keyboard flow (`A`/`F`/`I` keys) is a clear smoothness win but ~20+ mutations to refactor — its own multi-day project.

## Notes
- The user's "think a bit more" mid-session pushback was the inflection point — caught me about to declare Track A "done" with surface-level fixes (3 hooks + memo + console gating). The actual biggest issue (every page bundling the 3D engine) wasn't in the original audit. Lesson: when the user asks for deeper thinking, take it seriously — the obvious-from-the-console-output diagnosis is rarely the biggest win.
- Skipped Track C2 (viewer Web Worker) deliberately. ThatOpen registers DOM event listeners directly; full OffscreenCanvas migration would be a fork of the library. Scope in a future session only after profiling shows it's the actual bottleneck.
- Backend dev DB had migrations missing — `migrate entities` triggered a cascade applying `projects.0006`, `0007`, `entities.0036`, `0037`, `0038`, `0039`. Either DB was reset recently or this branch hadn't been migrated. Tests still passed throughout; the cascade resolved cleanly.
- Audit accuracy check: the original Explore-agent audit flagged `claim_issue_resolver.py` as missing `select_related`. It wasn't. Always trust-but-verify on agent reports — read the file before editing.
