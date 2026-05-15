# Session: Latency floor decomposition — `conn_max_age=60` + Redis CACHES

## Summary
Continuation of the latency thread. Yesterday's session shipped the always-on `Server-Timing: total;dur=X` middleware (`2e7518f`); today's session used it to decompose the `/api/me/` ~840 ms prod floor into server vs wire, found Django was hauling ~250 ms of auth-path overhead, and shipped two settings changes that dropped warm cache-hit server time from 248–342 ms to 109–112 ms (median −55%). Wall-time warm dropped from ~625 ms to ~572 ms. Wire (~360 ms) now dominates and is RTT-bound — out of scope without an edge-caching layer.

Coordinator round shape: three parallel tracks (one chrome-devtools measurement + two backend research) running concurrently while the integration phase waited. Plan file: `~/.claude/plans/keep-pushing-whimsical-falcon.md`.

## Changes

### `e398eb4 perf(settings): conn_max_age=60 + Redis CACHES to cut /api/me/ 250ms server floor`
- `backend/config/settings.py:162` — `conn_max_age` 0→60 s. Postgres connections now reuse across requests within a 60 s window instead of paying the Railway handshake (~30–80 ms) per request. `conn_health_checks=True` already protects against stale connections. No PgBouncer in front (Supabase pooler exists on port 6543 but the app routes direct to 5432), so Django pooling is the only layer here.
- `backend/config/settings.py:179–192` — added Django `CACHES` block pointing at the existing Redis (the Celery broker, DB unchanged, `KEY_PREFIX='sprucelab'` namespaces away from Celery's broker keys). Gated on `REDIS_URL` so local dev without Redis still falls back to default LocMemCache. The Supabase JWT verify cache at `config.authentication.py:113–125` uses Django's `cache` API → automatically picks up the new backend with zero code change.

## Coordinator round

Three tracks dispatched in parallel:

- **Track A (chrome-devtools, general-purpose agent)** — Measured `/api/me/` Server-Timing on prod (5 samples). Verdict: mixed, leaning wire-dominant; server consistently 248–342 ms (Django auth overhead); wire 329–545 ms (RTT-bound). Server was clearly fixable.
- **Track B (Explore agent)** — Prepared `conn_max_age` diff. Found no PgBouncer; recommended 60 s pool lifetime. Diff was 1 line.
- **Track C (Explore agent)** — Prepared `CACHES` diff. Confirmed `redis==5.0.1` already in requirements; confirmed auth path uses Django's `cache` API. Recommended Django 5.0's built-in `RedisCache` (no `django-redis` dependency). Caught one issue in the agent's initial diff (an `OPTIONS={'CLIENT_CLASS': ...}` that's `django-redis`-only, not built-in `RedisCache`) — dropped during integration.

Tracks B and C bundled into a single commit since both target the same auth-path floor and are mechanically independent ~10-line settings changes — one deploy cycle, one re-measure.

## Verification

### Pre-fix samples (n=5)

| sample | wall ms | server ms | wire ms |
|--------|---------|-----------|---------|
| cold   | ~870    | 325       | ~545    |
| warm   | 605     | 250       | 355     |
| warm   | 578     | 249       | 329     |
| warm   | 675     | 342       | 333     |
| warm   | 661     | 248       | 413     |

### Post-fix samples (n=6, after Railway deploy 14:57Z → ~15:00Z)

| sample | wall ms | server ms | wire ms |
|--------|---------|-----------|---------|
| cold   | 2392    | 1406      | 986     |
| warm   | 471     | 110       | 361     |
| warm   | 542     | 112       | 430     |
| warm   | 505     | 109       | 396     |
| warm   | 678     | 351       | 327     |
| warm   | 663     | 336       | 327     |

- Pre-fix server-ms warm (avg/median): **272 / 249 ms** → post-fix: **203 / 112 ms** (Δ −69 / −137 ms, −25 % avg / **−55 % median**).
- Pre-fix wall-ms warm avg: **~625 ms** → post-fix: **572 ms** (Δ −53 ms, −8 %).

The bimodal post-fix distribution (110 / 340) is the Supabase JWT cache doing its job: requests within the 60 s TTL hit the (now shared) cache and serve in ~110 ms; requests straddling the TTL pay a full Supabase RPC and revert to the old ~340 ms floor. Median is the right summary stat here, not average.

### Deploys
- Railway: commit `e398eb4` deployed ~14:59:30 Z (first cold sample at 15:00:29 Z confirms a fresh-worker hit).
- Vercel: not triggered — `frontend/` untouched.
- GitHub Actions CI: green for `e398eb4`.

## Technical Details

### Why the server floor was Django auth, not the DB query
`/api/me/` itself is a trivial DRF action: `_serialize_profile(request.user)` returns a small dict. The user object is already populated by the auth middleware before the view runs. The expensive work is the auth middleware itself — specifically `SupabaseAuthentication.authenticate()` doing one of two paths per request:
1. **Cache hit**: 1 Postgres SELECT (UserProfile lookup), no Supabase RPC.
2. **Cache miss**: 1 Supabase RPC to `/auth/v1/user` (~200–300 ms) + 1+ Postgres SELECTs.

Per-worker LocMemCache meant the cache hit rate at the application level was effectively `1 / N_workers` for any given token in a multi-worker deployment. Sharing the cache across workers via Redis raises the hit rate to ~100 % within the 60 s TTL.

### Why `conn_max_age=60` is safe on Railway
Railway's hosted Postgres tolerates plenty of long-lived connections. The historical "Close connections immediately to prevent pool exhaustion" comment was a defensive choice from before we had `conn_health_checks=True`. With health checks on, stale connections returned to the pool are validated on the next checkout — so the only risk of a longer pool lifetime is occasional `idle_in_transaction` timeouts, which Postgres handles by closing the connection (and Django picks up a fresh one via health-check). 60 s is short enough to amortize per-request handshakes during a click burst without holding connections across a deploy or idle window.

### Why we used built-in `RedisCache` instead of `django-redis`
`django-redis` has more knobs (sentinel/cluster support, advanced serializers, connection pool tuning) but we don't need any of them. The built-in `django.core.cache.backends.redis.RedisCache` is part of Django 5.0+, requires only the raw `redis` package (already in `requirements.txt`), and supports `KEY_PREFIX` + `TIMEOUT` out of the box. Avoiding a new dependency is worth the small feature gap; we can switch later if we need sentinel.

### Track C agent diff correction
Track C's prepared diff included `OPTIONS={'CLIENT_CLASS': 'django.core.cache.backends.redis.DefaultClient'}` — that path doesn't exist; `CLIENT_CLASS` is a `django-redis` config key, not a built-in `RedisCache` option. Caught during integration. Built-in `RedisCache` doesn't need `OPTIONS` at all when the default pool is fine — the URL's DB number and the `KEY_PREFIX`/`TIMEOUT` keys are sufficient.

## Next

1. **Remaining wire dominance is RTT, not Django.** Warm-fix wall ms ≈ 572 ms = ~110 ms server + ~360 ms wire (TLS handshake amortization + HTTP/2 framing + 1+ RTTs us-east-4 → EU client). The only way to push this further is either a CDN-edge cache for authenticated `/api/me/` responses (tricky — depends on Authorization header so cache keys explode) or a regional Railway deployment closer to the user. Both are bigger changes than we want to chase right now.
2. **Cache miss spikes are the real residual floor.** Two of five warm samples were 336/351 ms — a request straddling the 60 s Supabase TTL pays a full Supabase RPC. If this becomes visible UX, options are (a) longer TTL (60 s → 300 s — token revocations get delayed by 4 min); (b) async refresh-on-near-expiry; (c) drop Supabase JWT introspection in favor of local JWKS verification (no network, no TTL).
3. **Carry-overs**: FederatedViewer self-heal (deferred), Viewer P0s (parked, explicit ask), worktree cleanup (destructive, explicit go), `?profile=1` DB breakdown (still needs `PROFILE_QUERIES=True` on Railway if we want to dig deeper into the remaining ~110 ms server floor — likely Postgres SELECT + middleware overhead).

## Notes

- Track C agent had a small but real correctness bug (`CLIENT_CLASS` in built-in `RedisCache` OPTIONS). The Explore agent's research was fine; the diff produced just needed integration review. Worth remembering: agent-prepared diffs need a "would this actually run?" check, especially when they reference framework-specific config keys.
- The "every coordinator round must include a frontend agent" rule was retired this session — frontend audits came back clean (cross-filter toggle-off coverage and `*Layout` provider-inside-consumer audit both found nothing actionable), so this round ran three backend tracks without a frontend track. User confirmed the rule retraction. Memory updated.
