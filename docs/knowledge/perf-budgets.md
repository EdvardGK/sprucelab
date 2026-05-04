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
| `GET /api/projects/{id}/dashboard-metrics/`         | < 400 ms       | O(1)           | not yet pinned — TODO |

Bar to raise the asserted query count in a regression test: a passing
`EXPLAIN ANALYZE` showing the new query is a justified single-pass scan, not
an N+1 reintroduced.

## Frontend route budgets

Measured on a cold cache, throttled to "Fast 3G" via Chrome devtools.

| Route                              | First Contentful Paint | JS gzipped | Status |
|------------------------------------|-----------------------:|-----------:|--------|
| `/login`                           | < 1.5 s                | ~200 KB    | ✓ shipped 2026-05-01 (was 1,634 KB pre-route-lazy-load — 8× drop) |
| `/projects`                        | < 1.8 s                | ~210 KB    | ✓ shipped 2026-05-01 |
| `/projects/:id/types`              | < 2.5 s                | ~280 KB    | ✓ shipped (no 3D viewer chunk) |
| `/projects/:id/models/:modelId`    | < 4 s                  | ~1.1 MB    | acceptable — loads UnifiedBIMViewer + ThatOpen on demand |
| `/projects/:id/viewer/:groupId`    | < 4 s                  | ~1.1 MB    | acceptable — same reason |

Bar to raise a route's gzipped JS budget: a justified addition (new feature
that genuinely needs the bytes), not "we picked up an extra dep accidentally".

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
