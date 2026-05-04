# Session: perf-budgets measured + dev login bypass for local

## Summary

Two-act session. **Act 1**: closed out the May-1 perf-pass follow-up by browser-verifying Track A and populating `docs/knowledge/perf-budgets.md` with measured numbers — committed on `feat/perf-hardening-pass`, CI green. **Act 2**: user asked to skip the Supabase login when working locally; built a two-key auth bypass (backend `DEV_AUTH_BYPASS=1` + `DEBUG=True`, frontend `VITE_DEV_AUTH_BYPASS=1`) gated so it cannot fire in production. Split off as PR #4 to keep the perf history clean.

The bypass closes the loop on a friction point that the perf-verification work surfaced — protected-route FCP measurements were deferred precisely because of the Supabase auth gate. With bypass active, future perf passes can hit `/projects/:id/types`, `/projects/:id/models/:modelId`, etc. live with real data.

## Changes

### Act 1 — perf-budgets measurements (PR #3, commit `fa21456`)

`docs/knowledge/perf-budgets.md` — added two new "Measured (2026-05-04, omarchy local)" subsections under Frontend and Backend, plus a fix to a doc bug.

**Frontend (vite preview prod build, port 4173):**

- `/login` measured live with `mcp__chrome-devtools__*`: FCP **168 ms unthrottled / 624 ms Fast 4G / 2,456 ms Fast 3G**; JS transferred **202 KB gz** (entry 200 KB + Login 1.21 KB). Bundle target ✓; Fast 3G FCP exceeds 1.5 s target — noted that the original target was implicitly Fast 4G.
- Protected routes auth-gated, so reported as deterministic chunk-byte sums from the build manifest. `/projects` 224 KB ✓, `/projects/:id/types` 261 KB ✓, **`ModelWorkspace` 1,469 KB ⚠** (target 1.1 MB), **`FederatedViewer` 1,250 KB ⚠**. Both viewer routes exceed budget — `UnifiedBIMViewer` chunk alone is 880 KB gz.
- Production console silence verified structurally: zero hits across `dist/assets/*.js` for `[InlineViewer]` / `[HUDScene]` / `[viewer.perf]`. Vite DCE strips the `if (import.meta.env.DEV)` blocks at build time.

**Backend (?profile=1, dev DB, 6-model project):**

| Endpoint | Q | DB ms | Total ms |
|---|---:|---:|---:|
| `statistics/` | 15 | 27 | 38 |
| `scopes/{id}/floors/` | 5 | 8 | 14 |
| `types/?model=…&page_size=20` | 5 | 8 | 81 cold |
| `types/?model=…&page_size=100` | 5 | 8 | 20 warm |
| `types/dashboard-metrics?project_id` | 65 | 28 | 72 ⚠ |
| `types/dashboard-metrics?model_id` | 17 | 9 | 21 |
| `projects/{id}/` retrieve | 7 | 8 | 14 |

**Doc fix**: previous version referenced `GET /api/projects/{id}/dashboard-metrics/` which 404s. Actual route is `/api/types/types/dashboard-metrics/?project_id={id}`. Corrected.

### Act 2 — dev auth bypass (PR #4, commit `26029dc`)

New PR off `main`. Six files changed:

- `backend/config/authentication.py` — new `DevBypassAuthentication` class. Authenticates as auto-created dev superuser (`dev@local.test`, approved `UserProfile`) when both `DEBUG=True` AND `DEV_AUTH_BYPASS=1`. Returns `None` when not active so it chains cleanly to `SupabaseAuthentication`.
- `backend/config/settings.py` — registered `DevBypassAuthentication` first in `DEFAULT_AUTHENTICATION_CLASSES`. Read `DEV_AUTH_BYPASS` + `DEV_AUTH_BYPASS_EMAIL` from env. Added `http://localhost:4173` (and `127.0.0.1:4173`) to `CORS_ALLOWED_ORIGINS`.
- `frontend/src/contexts/AuthContext.tsx` — when `import.meta.env.VITE_DEV_AUTH_BYPASS === '1'`, init with synthetic `Session` + `User` and skip Supabase listeners entirely.
- `frontend/src/lib/api-client.ts` — bypass mode skips Supabase token attachment + the 401-redirect-to-login loop.
- `frontend/.env.development` (new, committed) — sets `VITE_DEV_AUTH_BYPASS=1` + the localhost API URLs.
- `.env.dev.example` — documents the backend toggle.

## Technical Details

### Why the live FCP measurement was only valid for `/login`

`RequireAuth` short-circuits with `<Navigate to="/login" />` whenever there's no Supabase `user`. The lazy-imported page component never renders, so its chunk never loads. That's why the Network tab on a redirected protected route shows only the entry chunk + Login chunk — not the chunks the page would have requested. Two ways to get a live cold-cache FCP measurement on protected routes: (a) a real Supabase test user with an `approved` UserProfile (which we don't have committed), or (b) a temporary auth-bypass build flag (which we now have via the Act 2 work).

### Why bypass needs TWO independent flags

If the bypass were guarded only by `import.meta.env.DEV` (frontend) or only by `DEBUG=True` (backend), a single misconfiguration in either env could break the safety story. Two separate, explicit env vars (`DEV_AUTH_BYPASS` and `VITE_DEV_AUTH_BYPASS`) means production deploys would have to set BOTH for bypass to fire — and `.env.production` doesn't set it, plus production has `DEBUG=False`, plus the backend gate refuses to fire when `DEBUG=False`. Three independent kill-switches for a feature that, if it leaked, would expose the entire Django API as the dev superuser.

### Backend route path mismatch in perf-budgets doc

`dashboard-metrics` is mounted on the entities `types` ViewSet, not on the projects router. The previous doc author wrote `/api/projects/{id}/dashboard-metrics/` (the URL they probably wished existed). 404 was silent because the SPA-style fallback returns the index.html with a long Content-Length, not an obvious error body. The fix is one line in the doc; the symptom (the doc lying about what to call) is what we caught while running real `?profile=1` checks.

### Pre-existing config drift discovered (NOT fixed in this session)

`.env.dev` says `IFC_SERVICE_URL=http://localhost:8001` but `dev.sh` boots FastAPI on **port 8100**. So Django's calls to the IFC service connection-refuse, surfacing as 500s on `/api/types/types/{id}/instances/?limit=…`. The bypass session caught this because we could finally hit those endpoints without auth friction. One-line fix; queued for a separate tiny PR.

### Branch hygiene

Initial bypass commit landed on `feat/perf-hardening-pass` (active branch at the time). On reflection that mixed concerns badly — PR #3's title says "perf hardening pass A/B/C1/D" and adding bypass would muddle. Cherry-picked to a new `feat/dev-auth-bypass` branch off `main`, opened PR #4, then `git reset --hard origin/feat/perf-hardening-pass` to drop the bypass commit from the perf branch. Net result: PR #3 unchanged at `fa21456` (pure perf), PR #4 at `26029dc` (pure bypass).

## Next

1. **User decision: merge PR #3 (perf-hardening) and/or PR #4 (bypass).** Both green or expected to pass CI. PR #3 still triggers Vercel + Railway deploy + `entities/0039` migration; PR #4 is dev-only and shouldn't change prod behavior, but verifies cleanly that bypass cannot fire under `DEBUG=False`.
2. **Tiny `IFC_SERVICE_URL` fix** — change `.env.dev.example` from `:8001` to `:8100` to match what `dev.sh` actually boots. One-liner, separate PR.
3. **`UnifiedBIMViewer` chunk split** — flagged in perf-budgets as the cause of viewer-route over-budget. Lifting property-panel / filter Zustand store / warehouse-specific viewer wiring out of the core viewer chunk would land both viewer routes back in budget.
4. **`dashboard-metrics?project_id` parity test** — pin a `assertNumQueries` regression now that we know it's likely O(n_models). Bar to fix at code level: `EXPLAIN ANALYZE` showing the query is justified.
5. **Live FCP for protected routes** — now possible thanks to the bypass. Future perf passes should run `?profile=1` on the API plus a chrome-devtools FCP capture for `/projects/:id/types` and the viewer routes, replace the deterministic-chunk-sum rows with measured numbers.
6. **May-3 worklog** (`2026-05-03-22-40_*.md`) still untracked — tiny doc PR after PR #3 merges.

Still gated on edkjo replies (unchanged):
- A.x track / PR #2 embed-pass code (Q1/Q3/Q5/Q9)
- Framework PR 1 (Qs 1–17 + sign-off + edkjo pass)

## Notes

- PR #3: https://github.com/EdvardGK/sprucelab/pull/3 (perf hardening + measurements; held at merge gate)
- PR #4: https://github.com/EdvardGK/sprucelab/pull/4 (dev login bypass; new)
- Did NOT add a memory entry for the bypass mechanism specifically — the implementation is documented in `.env.dev.example` and the PR body, and the dev-environment.md memory should be updated separately if this is the new norm.
- The worklog from this session and the prior session's worklog (`2026-05-04-07-07_*.md`) cover two consecutive sessions of the same operator (omarchy). Both should be on `main` after PR #3 merges.
- Used `ScheduleWakeup` once incorrectly (autonomous-loop sentinel without being in /loop mode). Harmless but noted — the right tool would have been Bash `run_in_background`. Won't repeat.
