# Session: Always-on Server-Timing + admin Tooltip crash + Iver approval

## Summary
Continuation of the 08-02 latency session. Three things landed: (1) split the request-profiler middleware so `Server-Timing: total;dur=X` is emitted on every response (was opt-in via `?profile=1`), unblocking the per-request floor decomposition without needing a Railway env-var flip; (2) approved waitlisted user Iver Grytting via the prod admin API after the user reported the admin UI was blank-screening; (3) root-caused and fixed the admin blank screen — `AdminLayout`'s sidebar Tooltip lived outside the `TooltipProvider` because the provider was mounted by `AdminShell` *inside* `AdminLayout`, so every admin route crashed before rendering.

## Changes

### `2e7518f perf(middleware): always-on Server-Timing total; opt-in DB breakdown`
- `backend/apps/core/middleware.py` — `QueryCountProfilerMiddleware` now always wraps `get_response` in a `perf_counter` delta and emits `Server-Timing: total;dur=X` on the response. The DB-breakdown path (`X-DB-Query-Count`, `X-DB-Query-Time-Ms`, second Server-Timing entry) still gates on `?profile=1` + (`DEBUG` or `PROFILE_QUERIES=True`) because `connection.queries` only populates under those conditions.
- `backend/config/settings.py:126-130` — stale comment refreshed to match.
- Cost: one `perf_counter` delta per request (~nanoseconds). Negligible.

### Operational: approved Iver Grytting
- User reported `/admin` errored when trying to approve. Pulled `/api/admin/dashboard/` from the still-authed chrome-devtools session, found user `id=11, iver.grytting@skiplum.no` pending, POSTed `/api/admin/users/11/approve/`. 200 OK, `approval_status="approved"`, `approved_at=2026-05-15T12:25:08Z`. No code change.

### `674f7b6 fix(admin): Tooltip must be used within TooltipProvider — wrap layout itself`
- `frontend/src/components/admin/AdminLayout.tsx` — `TooltipProvider` now wraps the layout's own root `<div>`. AdminLayout owns the sidebar Tooltip; it should also own the provider. Structurally guarantees context for success / loading / error branches.
- `frontend/src/pages/admin/AdminShell.tsx` — removed the redundant provider (was wrapping only the `<Outlet>`, leaving the sidebar Tooltip orphan'd in every branch).
- Symptom: every `/admin/*` route blank-screened with `Tooltip must be used within TooltipProvider`. Verified live post-deploy: `/admin` renders, 0 console errors, all 6 sidebar links navigable, KPI tiles populated, Users tile shows 9 approved · 0 pending.

## Technical Details

### Why Server-Timing middleware was opt-in before
The original middleware combined two responsibilities: timing the request AND counting DB queries. DB-query counting requires `connection.queries` to be populated, which Django only does under `DEBUG` or `connection.force_debug_cursor` — so the whole thing was gated to avoid measuring DB time with a half-populated list. Splitting it lets the cheap timing path always run while keeping the DB path correctness-gated.

### Why the admin Tooltip bug was latent rather than caught earlier
The provider was inside the layout, not above it. JSX makes "the provider wraps its consumer" obvious when both live in the same file. Here `AdminShell` mounted the provider; `AdminLayout` consumed it — but the consumer rendered *around* the provider's children, not inside them. Two-file separation hid the ordering. Tooltip is a render-time consumer (calls `useContext` immediately), so the error fires the first time AdminLayout mounts — there's no "works on the happy path, breaks on error" subtlety. The reason it wasn't caught earlier is probably that prior testing flowed through the success branch fast and the user wasn't looking at the console. The structural fix (provider co-located with consumer) makes the class of bug impossible.

### Iver's symptom vs. our diagnosis
User's reported "im getting error" on the approve UI was the Tooltip crash, not an approve-endpoint failure. The approve endpoint itself works (verified by hitting it directly with the user's superuser token from the open chrome-devtools session). Fixing AdminShell unblocked the UI; the user can now self-approve future waitlisters without escalating.

## Verification
- `tsc --noEmit` clean on the admin fix.
- Live verification post-deploy via chrome-devtools `take_snapshot` of `/admin`: 0 console errors, full sidebar + KPI tiles render.
- Vercel deploy `4700949449` success at 12:31:49Z (commit `674f7b6`).
- Railway deploy `4700926532` success at 12:30:28Z (commit `674f7b6`, backend untouched but still rolled forward).
- Earlier middleware commit `2e7518f` deployed and verified at 11:17:18Z.
- All 3 CI checks (Supabase Preview / Backend unit tests / Frontend type check) passed for both pushes.

## Next
1. **Re-measure `/api/me/` floor with Server-Timing.** Now that `total;dur=X` is on every response, hit prod from chrome-devtools and decompose the 840 ms floor: how much is wire (~110 ms RTT × keep-alive amortization), how much is Django middleware/auth processing. Will surface in the Network → Timings panel natively. ~5 min. **Task #7 is queued for this and was deferred when the admin error report came in.**
2. **If Server-Timing confirms Django dominates the floor**, flip `?profile=1` on a request that the middleware will profile fully — needs `PROFILE_QUERIES=True` on Railway (external action — ask edkjo first). Reads X-DB-Query-Count to decompose further. Then act on conn_max_age, CACHES backend, or `_get_or_create_user` cache hit per the prior worklog's queue.
3. **Carry-overs**: FederatedViewer self-heal (deferred), Viewer P0s (parked), worktree cleanup (destructive, needs go).

## Notes
- The provider-inside-consumer anti-pattern is worth a self-review on other `*Layout` files — anywhere a layout renders a `useContext` consumer (Tooltip, RadixDialog, Form, etc.), the provider has to wrap the layout, not be a child of it. Sidebar.tsx (which mounts its own TooltipProvider at line 169) already does this correctly. No other suspects spotted in the quick `grep TooltipProvider` pass.
- The "BUILD" field on `/admin/overview` is the backend version (Railway service); frontend-only commits don't bump it. Currently shows `2e7518f` even though the live frontend is `674f7b6`. That's expected — there's no `frontend-build-sha` field in the AdminOverview data. Could add one if it becomes confusing.
- Vercel doesn't trigger on backend-only commits (its ignoreCommand at the repo root gates on `frontend/` paths) — confirmed for `ec2704d` (backfill flag) and `29abb30` (worklogs). It correctly DID trigger on `2e7518f` because the middleware commit also touched `backend/config/settings.py`, which... hmm, actually that's still backend. Wait — looking at the deploys list, `2e7518f` only has a Railway deployment, not a Vercel one. So Vercel didn't trigger on `2e7518f` either. That's right: it only triggers on frontend changes. The `674f7b6` admin fix is the one that triggered Vercel today.
