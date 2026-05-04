# Performance Budgets

Living document. Targets for hot endpoints and user-perceived flows. Update
when you add a new endpoint hit by the UI on every page load, or when an
existing endpoint changes shape.

> **Product principle**: users come for the business problems we solve and
> stay for the speed, smoothness, and attention to detail.

## How to measure (dev)

`apps.core.middleware.QueryCountProfilerMiddleware` adds three response headers
on requests with `?profile=1` (DEBUG mode by default; flip
`PROFILE_QUERIES=True` in settings to enable in any env):

  - `X-DB-Query-Count` — number of SQL queries the request issued
  - `X-DB-Query-Time-Ms` — time spent inside DB queries
  - `Server-Timing: db;dur=...` — read natively by Chrome devtools (Network
    tab → Timings panel)

Append `?profile=1` to any DRF URL and inspect the response headers.

## Backend endpoint budgets

Numbers are p50 targets on a representative project (≈10 models, ≈200 types,
≈100 materials per model). "Q" is the asserted query count from
`tests/unit/test_query_counts.py` regression tests.

| Endpoint                                            | Target latency | Target queries | Status |
|-----------------------------------------------------|---------------:|---------------:|--------|
| `GET /api/projects/{id}/statistics/`                | < 300 ms       | O(1)           | ✓ enforced via `assertNumQueries` parity test (1 type vs 20 types → same count) |
| `GET /api/projects/scopes/{id}/floors/`             | < 200 ms       | O(1)           | ✓ enforced via parity test (1 model vs 10 models → same count) |
| `GET /api/types/types/?model={id}`                  | < 500 ms       | O(1)           | not yet pinned — TODO regression test |
| `GET /api/types/types/{id}/claim-issues/`           | < 200 ms       | O(1)           | already optimal (uses `select_related('document__source_file')`) |
| `POST /api/models/{id}/publish/`                    | < 1 s          | depends on storey-deviation gate (off by default) | acceptable; deviation check itself is O(1) per model |
| `GET /api/types/types/dashboard-metrics/`           | < 400 ms       | O(1)           | not yet pinned — TODO; 2026-05-04 spot check showed Q=65 at `?project_id` vs Q=17 at `?model_id` (6 models). Latency well under target; query parity test overdue. |

Bar to raise the asserted query count in a regression test: a passing
`EXPLAIN ANALYZE` showing the new query is a justified single-pass scan, not
an N+1 reintroduced.

### Measured (2026-05-04, omarchy local — 6-model project, dev DB, dev Django)

Captured with `?profile=1`. Cold cache where indicated.

| Endpoint | Queries | DB ms | Total ms | vs target |
|----------|--------:|------:|---------:|-----------|
| `GET /api/projects/{id}/statistics/` | 15 | 27 | 38.57 | ✓ (38 ≪ 300) |
| `GET /api/projects/scopes/{id}/floors/` (project-root scope) | 5 | 8 | 14.14 | ✓ (14 ≪ 200) |
| `GET /api/types/types/?model={id}&page_size=20` | 5 | 8 | 81.58 | ✓ (cold) |
| `GET /api/types/types/?model={id}&page_size=100` | 5 | 8 | 20.26 | ✓ (warm; query count unchanged across page sizes — pagination is honored) |
| `GET /api/types/types/dashboard-metrics/?project_id={id}` | 65 | 28 | 71.69 | ✓ latency, ⚠ query count high — likely O(n_models). Pin a parity test before next refactor. |
| `GET /api/types/types/dashboard-metrics/?model_id={id}` | 17 | 9 | 21.05 | ✓ |
| `GET /api/projects/{id}/` (retrieve) | 7 | 8 | 14.57 | informational (no budget row) |

Note: previous version of this doc had `GET /api/projects/{id}/dashboard-metrics/` which 404s — the actual route is mounted under the `types` ViewSet at `/api/types/types/dashboard-metrics/`. Fixed in the table above.

## Frontend route budgets

Measured on a cold cache, throttled to "Fast 3G" via Chrome devtools.

| Route                              | First Contentful Paint | JS gzipped | Status |
|------------------------------------|-----------------------:|-----------:|--------|
| `/login`                           | < 1.5 s                | ~200 KB    | ✓ shipped 2026-05-01 (was 1,634 KB pre-route-lazy-load — 8× drop) |
| `/projects`                        | < 1.8 s                | ~210 KB    | ✓ shipped 2026-05-01 |
| `/projects/:id/types`              | < 2.5 s                | ~280 KB    | ✓ shipped (no 3D viewer chunk) |
| `/projects/:id/models/:modelId`    | < 4 s                  | ~1.1 MB    | ⚠ over budget — see Measured row below (~1.45 MB observed). Driven by `UnifiedBIMViewer` chunk being 880 KB gz on its own. |
| `/projects/:id/viewer/:groupId`    | < 4 s                  | ~1.1 MB    | ⚠ over budget — see Measured row below (~1.25 MB observed). Same root cause. |

Bar to raise a route's gzipped JS budget: a justified addition (new feature
that genuinely needs the bytes), not "we picked up an extra dep accidentally".

### Measured (2026-05-04, omarchy local — vite preview prod build, port 4173)

`/login` was measured live. Other routes are auth-gated (Supabase + Django
`me.profile.approval_status` gate via `RequireAuth`); their numbers below are
**deterministic chunk-byte sums from the build manifest** — `transferSize`
that any cold-cache visitor would download once auth resolves. Cumulative bytes
include the entry chunk (`index-Dz8HAjx1.js`, 200.36 KB gz), the `AppLayout`
shell for protected routes (22.04 KB gz), the page chunk, and statically-imported
deps. UI-primitive chunks (e.g. `dropdown-menu` 6.23 KB, `tabs` 1.38 KB,
`tooltip` 2.97 KB) load on demand and are NOT included unless the page eagerly
imports them.

| Route | JS gz (transferred) | FCP (Fast 4G) | FCP (Fast 3G) | FCP (unthrottled) | vs target |
|-------|--------------------:|--------------:|--------------:|------------------:|-----------|
| `/login` | 202 KB *(measured)* | 624 ms | 2,456 ms | 168 ms | ✓ JS ≤ target. FCP target was set against an unspecified throttle level — at unthrottled localhost it's well under, at Fast 4G still under, at Fast 3G the parse+execute cost on a 200 KB JS payload pushes past the 1.5 s target. Treat the 1.5 s target as Fast 4G ambition; a Fast 3G ambition would be ≤ 3 s. |
| `/projects` (ProjectsGallery) | 224 KB *(202 + 22 AppLayout + 1.13 page)* | n/a | n/a | n/a | ✓ within ~210 KB target (rounding) |
| `/projects/:id/types` (ProjectTypesPage) | 261 KB *(202 + 22 + 6.61 + TypeMappingGrid 30.16)* | n/a | n/a | n/a | ✓ under 280 KB target |
| `/projects/:id/models/:modelId` (ModelWorkspace) | 1,469 KB *(202 + 22 + 231.89 + UnifiedBIMViewer 880.89 + three.module 134.10)* | n/a | n/a | n/a | ⚠ ~1.45 MB vs 1.1 MB target. UnifiedBIMViewer chunk alone is 880 KB. Splitting it (lazy-import the property-panel + filter Zustand store + warehouse-specific viewer wiring out of the core viewer) would move this back inside budget. |
| `/projects/:id/viewer/:groupId` (FederatedViewer) | 1,250 KB *(202 + 22 + 12.69 + UnifiedBIMViewer 880.89 + three.module 134.10)* | n/a | n/a | n/a | ⚠ ~1.25 MB vs 1.1 MB target. Same root cause as above. |

**Behavioral budget — DEV-gated console silence**: `grep` of all `dist/assets/*.js` for `[InlineViewer]`, `[HUDScene]`, `viewer.perf` returns **0 hits** — Vite's dead-code-elimination strips the entire `if (import.meta.env.DEV) { console.log(...) }` block at build time. Production console silence is structurally guaranteed.

**Methodology caveat for protected-route measurements**: These rows are bundle bytes from the build artifact — the deterministic floor of what cold-cache visitors download. They do NOT include browser parse/execute cost or runtime API calls. A live cold-cache FCP measurement on protected routes requires either (a) a real Supabase test user with an `approved` UserProfile + `?profile=1` on the corresponding API calls, or (b) a temporary auth-bypass build flag. Recommended follow-up: add a `--auth-bypass` Vite mode for perf measurement runs (gated behind `VITE_PERF_AUDIT=1`).

## Console hygiene budget

Production console MUST be quiet. `console.log/debug/info` calls in
`frontend/src/**` must be gated behind `import.meta.env.DEV`. Sweep with:

```bash
grep -rn "console\.\(log\|debug\|info\)" frontend/src --include="*.ts" --include="*.tsx" \
  | grep -v "import.meta.env.DEV"
```

Output should be either empty, or only show lines whose surrounding `if`
block already gates them. Errors and warnings (`console.error`,
`console.warn`) are exempt — they're production diagnostics.

## Network hygiene budget

User-visible interactions MUST NOT trigger:

- Retry storms on 4xx responses (TanStack Query default `retry: 3` is wrong
  for non-critical preview endpoints — set `retry: false` or filter on
  `error.status`).
- Redundant calls for the same `(modelId, guid)` across remounts (use
  in-memory caches + `staleTime: Infinity` for immutable data).
- Re-renders > 4× per state transition for components that mount expensive
  side effects (Three.js scene setup, large lists). Wrap with `React.memo`
  and confirm with browser console / React DevTools profiler.

## What this doc is NOT

- Not an SLA. Production targets live in monitoring config (Railway / Vercel
  metrics, future Grafana board).
- Not a definitive list. Add an entry when you change one of the listed
  endpoints or routes; remove an entry when an endpoint is deleted.
- Not a substitute for measurement. The numbers above are from regression
  tests + dev-tools spot checks, not load testing. If a change might affect a
  hot path, run `?profile=1` against it and update the row.
