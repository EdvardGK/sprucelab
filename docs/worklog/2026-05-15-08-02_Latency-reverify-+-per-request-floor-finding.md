# Session: Latency re-verify on G55 + per-request floor finding

## Summary
Re-ran the dashboard-metrics latency verification queued in the prior session's next-steps. The Wave-1+2 Track 4a N+1 collapse (`15d0718`) is validated — 3-4× improvement vs the pre-fix 3.6 s / 7.5 s baseline. But the new bottleneck has shifted off dashboard-metrics and onto **per-request overhead**: even essentially-empty endpoints (`/api/me/` returning 576 B) sit at a **~840 ms floor**. dashboard-metrics aggregating 6,089 types adds only ~410 ms on top of that floor. Also shipped the `--force` flag on `backfill_v3_fragments` queued from the prior session.

## Findings: latency on G55 (6,089 types)

### dashboard-metrics
| Test | Median | p95 / tail | vs 3.6s baseline | vs 500ms target |
|---|---|---|---|---|
| Sequential, 6 samples | 1283 ms | 1386 ms | 2.8× faster | 2.5× over |
| 8-way parallel (pass 1) | 1602 ms | tail 2217 ms | 3.4× faster | 4× over |
| 8-way parallel (pass 2) | 1282 ms | tail 1964 ms | 3.8× faster | 3-4× over |

### Per-endpoint floor (Norway → Railway us-east4)
| Endpoint | Body | Median | "Real work" above floor |
|---|---|---|---|
| `/api/me/` GET | 576 B | 844 ms | floor |
| `/api/me/` HEAD ×5 | — | 842 ms | floor |
| `/api/types/claims/` | 52 B | 842 ms | ~0 |
| `/api/projects/{id}/` | 322 B | 943 ms | ~100 ms |
| `/api/projects/{id}/statistics/` | 458 B | 1148 ms | ~310 ms |
| **`/api/types/types/dashboard-metrics/`** | **7 KB** | **1251 ms** | **~410 ms** |
| `/api/models/?project=…` | 9 KB | 1354 ms | ~510 ms |

Even HEAD on `/api/me/` (no response body, no view logic of substance) takes ~840 ms. The dominant cost is per-request overhead, not query work.

## Where the 840 ms floor likely sources from

Investigation surface: `backend/config/authentication.py` + `backend/config/settings.py`. Two strong suspects, neither yet measured:

### Suspect 1: `conn_max_age=0` on Postgres
`backend/config/settings.py:162` — Django closes the Postgres connection after every request. The inline comment says "prevent pool exhaustion", but the cost is paying TCP+TLS handshake to Supabase Postgres on every single request. Typical 50-150 ms. Pre-launch traffic is one user, so pool exhaustion is not a real concern; this looks like an out-of-date precaution.

### Suspect 2: JWT cache is `LocMemCache` (per-worker)
`backend/config/settings.py` has no `CACHES` setting → Django defaults to `LocMemCache`. The auth class at `backend/config/authentication.py:114-117` claims "one Supabase call per minute per active session" via `cache.set(cache_key, userinfo, USER_INFO_CACHE_TTL=60)`. But because `LocMemCache` is per-process, with N gunicorn workers each token is cached up to N times. Round-robin across workers can produce up to N cold Supabase roundtrips per token per minute (each one being a network call to `rtrgoqpsdmhhcmgietle.supabase.co/auth/v1/user`).

### Suspect 3: `_get_or_create_user` runs DB writes on every cache hit
`backend/config/authentication.py:119-244` — even on a JWT cache hit, `_get_or_create_user` runs every request: `UserProfile.objects.select_related('user').filter(supabase_id=…).first()` plus `_refresh_profile` which can issue UPDATEs if email/display_name/avatar_url changed. Combined with `conn_max_age=0` from Suspect 1, that's TCP+TLS + SELECT + possible UPDATE on every request just to authenticate.

### How to confirm
There's already a `QueryCountProfilerMiddleware` (`backend/apps/core/middleware.py`) that emits `Server-Timing: db;dur=…, total;dur=…` headers when `?profile=1` AND (`DEBUG` OR `PROFILE_QUERIES=True`). On prod, `DEBUG=False` and `PROFILE_QUERIES` is unset, so it's a no-op. To confirm the suspects, set `PROFILE_QUERIES=True` on Railway, then sample any endpoint with `?profile=1` and read `X-DB-Query-Count` + `Server-Timing` from Chrome DevTools.

## Changes
- `backend/apps/models/management/commands/backfill_v3_fragments.py` — `--force` flag. When set, skips the `fragments_status='generating'` safety guard so models stuck mid-generation from a prior crashed run can be resurrected from the same command (no more direct `trigger_fragment_generation()` invocation). Skip-message now hints `(re-run with --force to override)`.

## Verification
- Latency verification was the deliverable — see the data above. Three independent sampling strategies (Performance Resource Timing API, in-page fetch loop, 8-way parallel pass).
- `--force` flag: Python syntax check passes (`python -c "ast.parse(...)"`); behavior is a single conditional on `opts['force']`, tested by inspection.
- No prod DB or env-var changes made this session — all the per-request investigation was read-only against prod via chrome-devtools + read-only backend file inspection.

## Next
1. **Confirm the 840 ms floor cause.** Flip `PROFILE_QUERIES=True` on Railway. Re-run the same `/api/me/` HEAD loop with `?profile=1` and read the `Server-Timing` + `X-DB-Query-Count` headers from Chrome DevTools. That'll show whether DB time eats the bulk of the floor (likely) or whether middleware/auth runtime is the main offender. ~10 min once the env var lands.
2. **If DB time confirms** — flip `conn_max_age` from 0 to 600 in `backend/config/settings.py:162`. Single line, low risk pre-launch (one active user). Re-measure. Expect 100-200 ms drop across all endpoints. Add a connection-count monitor to watch for pool growth.
3. **Add Redis as the Django cache backend.** Already in the stack for Celery. Eliminates the per-worker LocMemCache duplication. Saves Supabase auth roundtrips when N>1 gunicorn workers.
4. **Trim `_get_or_create_user` on cache hit** — cache the resolved Django user alongside the userinfo so the profile select+refresh only runs on JWT cache miss. Saves one query per request.
5. **`--force` flag is in main** but un-pushed at the moment of this writeup; commit + push happens next.
6. **Carry-overs unchanged**: FederatedViewer self-heal (deferred), Viewer P0s (parked), worktree cleanup (destructive, needs go).

## Notes
- The N+1 collapse from `15d0718` worked exactly as advertised. 410 ms of real server work to aggregate metrics across 6,089 types is fine — that's the floor on the actual product logic. The remaining gap to the 500 ms-end-to-end target is now infrastructure, not query design.
- The 500 ms next-steps target assumed a ~480 ms Railway RTT floor. Actual floor is ~840 ms (~1.75× over). dashboard-metrics cannot reach <500 ms end-to-end until per-request overhead drops; query optimization alone is not the lever.
- "8-way parallel" in the original baseline (7.5 s tail) likely included frontend-side serialization (axios queueing, browser HTTP/2 stream limits). Today's 8-way pass in fetch() with HTTP/2 multiplexing completes in ~2 s wall time — that's the Django concurrency model holding up, not the workload getting easier.
- Railway edge is `railway/us-east4-eqdc4a` (Ashburn, VA). Oslo → Ashburn TCP RTT ~110 ms. EU region migration is a longer-term lever (cuts ~200+ ms from everything) but is the kind of change that affects every Sprucelab user, not just edkjo testing from Norway.
