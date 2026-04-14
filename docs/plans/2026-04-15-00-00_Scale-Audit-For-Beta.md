# Scale Audit — Pre-Beta

**Date**: 2026-04-15
**Goal**: Decide what to fix before inviting testers, what to accept, what to defer.
**Methodology**: Static audit of code + config + Railway logs. **No load test was run.** Numbers below are engineering estimates, not measurements.
**Target**: "100 concurrent users without degradation" is the realistic beta goal. 1000 concurrent is an aspirational number that would require architectural changes the platform isn't ready for and doesn't need yet.

---

## TL;DR

The platform will start degrading between **20–50 concurrent users** today. Most of the bottlenecks are configuration-level (not architecture-level) and fixable in ~8–12 hours of focused work to reach a comfortable 100–200 concurrent headroom.

There are **three critical issues** that are not about scale per se — they will cause visible problems at *any* concurrency and should be fixed before beta regardless:

1. **Celery worker has been offline since 2025-12-15.** `.delay()` calls queue to Redis with no consumer. `generate_fragments_task` never runs, so every model load in the viewer re-parses the raw IFC instead of loading prebuilt fragments. Other affected tasks: `run_model_analysis_task`, `enrich_model_task`, `revert_model_task`.
2. **FastAPI `IFCLoaderService._cache` is an unbounded dict.** Every `openFromUrl` call loads an IFC into process memory, never evicts. Container will OOM after accumulating ~10–30 large models, crashing for everyone.
3. **FastAPI service has no authentication.** `POST /api/v1/ifc/open/url` will download any URL you hand it. DoS and SSRF vectors on a public endpoint.

Everything else in this document is secondary to these three.

---

## What I could not verify from the CLI

- Railway resource plan (RAM / CPU allocation per service)
- Supabase tier limits (concurrent connections, auth RPS)
- Whether the Fast API Railway service has horizontal scaling configured
- Actual memory in use by the FastAPI container right now

If any of these are much lower than assumed (e.g., FastAPI is on a 512 MB plan), the OOM ceiling drops even further.

---

## Ranked action list

### CRITICAL — fix before beta

Each of these will cause visible failures at very low concurrency. None are scale-architecture fixes — all are small.

#### C1. Start the Celery worker service
**Where**: Railway — needs a new service alongside `Django` running `celery -A config worker`.
**Current state**: `railway.toml` defines only the Django web service. Celery is configured in `config/settings.py` (broker, result backend, task routing, prefetch=1) but no worker process is running. Confirmed via `django_celery_results_taskresult` — most recent task completed 2025-12-15, five months ago.
**Impact**: `generate_fragments_task.delay()`, `run_model_analysis_task.delay()`, `enrich_model_task.delay()`, `revert_model_task.delay()` all queue to Redis and never execute. The viewer's "fragments fast path" at `/api/models/<id>/fragments/` returns nothing, so every model load re-parses the raw IFC — 10-30× slower than it should be, and burns FastAPI memory unnecessarily.
**Fix**: Add a second Railway service in the same project, same Dockerfile, `startCommand = "celery -A config worker --loglevel=info --concurrency=2"`. Share the same Redis + Postgres env vars. Optionally add Celery Beat as a third service if we ever need periodic tasks.
**Effort**: **S (1h)** — just Railway config.
**Risk if unfixed**: Viewer stays slow, fragment cache never populates, analysis-dependent features silently return stale data.

#### C2. Bound the FastAPI IFC cache + wrap blocking calls in `to_thread()`
**Where**: `backend/ifc-service/services/ifc_loader.py`, `IFCLoaderService`.
**Current state**: `self._cache: Dict[str, ifcopenshell.file] = {}` — unbounded. The docstring says "Redis stores file_id -> file_path mapping for TTL management" but the code doesn't implement eviction anywhere. Files go in, never come out until the process dies. Also: `ifcopenshell.open()` is a blocking C call running inside async FastAPI handlers — it blocks the event loop for the entire parse duration, stalling every other request in that worker.
**Impact**: 10–30 concurrent users loading different models = OOM. One user loading a 500 MB IFC = every other request on that worker stalls for 5–20 seconds while the loop is blocked.
**Fix**:
  - Add an LRU cache with a hard cap (e.g., `functools.lru_cache`-style, or a simple `OrderedDict` with `MAX_CACHED_FILES=10` + `MAX_CACHED_RAM_MB=2048`). Evict oldest on insert when cap hit, call `ifcopenshell.file.close()` if available.
  - Wrap `ifcopenshell.open()` in `await asyncio.to_thread(ifcopenshell.open, path)` so parsing runs on a threadpool and doesn't block the event loop. Same for any other blocking ifcopenshell call in request-path code.
  - Optional: move the actual ifcopenshell work into a process pool (`concurrent.futures.ProcessPoolExecutor`) since ifcopenshell releases the GIL for C calls but Python-side property extraction doesn't.
**Effort**: **M (3–4h)** — eviction logic is simple, async-wrapping needs a careful pass through every endpoint.
**Risk if unfixed**: Random FastAPI container OOMs under beta load. Every model load stalls all concurrent users on that worker.

#### C3. Add auth to the FastAPI IFC service
**Where**: `backend/ifc-service/main.py`, `core/auth.py` (55 lines, probably stubbed).
**Current state**: No authentication middleware on any endpoint. `POST /api/v1/ifc/open/url` accepts any URL and downloads it. Anyone on the internet can point it at arbitrary URLs and tell it to load arbitrary IFC files into memory.
**Impact**: (a) SSRF — an attacker can make FastAPI request internal Railway addresses. (b) DoS — an attacker can fill FastAPI's memory with junk models. (c) Information disclosure — `GET /api/v1/ifc/<fileId>/elements/...` returns element data from any cached file; a lucky guess at `fileId` (or brute force) exposes content.
**Fix**: Add a FastAPI dependency that checks for `Authorization: Bearer <token>` and validates against Supabase via the same delegated `/auth/v1/user` path Django uses. Or, simpler: check for a shared internal API key (`IFC_SERVICE_API_KEY` is already defined in config.py with value `"dev-api-key-change-in-production"` — that's the tell) that only the frontend knows. Frontend has to pass it via `authedFetch` the same way we just wired Django.
**Effort**: **S (1–2h)** for internal-key; **M (3–4h)** for full Supabase delegation.
**Risk if unfixed**: DoS / SSRF. Not hypothetical — the endpoint is listed in the public Railway subdomain and anyone can reach it.

---

### HIGH — fix before inviting more than ~20 testers

These become bottlenecks at moderate concurrency but are survivable for a small initial group.

#### H1. Gunicorn worker tuning
**Where**: `railway.toml:12` — `--workers 2 --threads 4 --timeout 120`.
**Current state**: 2 sync workers × 4 threads = max 8 concurrent Django requests. Sync workers block on IO (including the Supabase auth delegation call), so effective concurrency is lower.
**Impact**: The 9th concurrent user queues. The 20th times out. Simple math.
**Fix**: Move to `gthread` (already in use via `--threads`, but the effective ceiling is low). Better: `uvicorn` workers via `gunicorn -k uvicorn.workers.UvicornWorker --workers N --worker-connections 1000` so Django can run on ASGI. That requires Django to be genuinely async-safe in its request path though — safer for now is just raising the sync worker count based on Railway RAM: roughly `workers = (2 * cpu_cores) + 1`, `threads = 4-8`. On a typical 1 vCPU / 1 GB Railway plan: `--workers 3 --threads 8 --timeout 120` is a reasonable starting point.
**Effort**: **S (15 min + measure)**.
**Risk if unfixed**: Linear request backup under burst load. Users see slow page loads and eventual 504s.

#### H2. Django DB connection reuse
**Where**: `backend/config/settings.py:145` — `conn_max_age=0`.
**Current state**: Comment says "Close connections immediately to prevent pool exhaustion". Every Django request opens a fresh Postgres connection, runs queries, closes it. At 6543 (Supabase pooler / pgBouncer in transaction mode), this means a full TCP handshake + auth round-trip per request.
**Impact**: Adds 20–80ms of latency to every request. At burst load, the pgBouncer side has to churn connections which has its own overhead.
**Fix**: Raise to `conn_max_age=60` (Django default is 0 but the docs recommend 60 for pooled setups). Supabase transaction-mode pooler handles connection reuse safely — Django's own connection-per-request pattern is what caused the original concern, but with `conn_max_age=60` Django keeps the connection alive within the request lifecycle instead of making it session-sticky. Alternative: run `django-db-connection-pool` or `psycopg[pool]` with an explicit pool.
**Effort**: **S (15 min + smoke test)**.
**Risk if unfixed**: Higher per-request latency, more load on Supabase pooler.

#### H3. FastAPI worker count
**Where**: `backend/ifc-service/Dockerfile:64` — `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}`.
**Current state**: No `--workers` flag → single uvicorn worker. Combined with C2's event-loop blocking, any slow request stalls the entire service.
**Impact**: FastAPI processes requests sequentially from any one user's perspective whenever a blocking call is running.
**Fix**: `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 3` (or more, constrained by container RAM — each worker loads the same libraries plus its own IFC cache). Pairs naturally with C2: bounded cache × N workers.
**Effort**: **S (5 min)**.
**Risk if unfixed**: FastAPI handles one slow request at a time. Pairs badly with C2 — fixing workers without C2 just means you get N parallel ways to OOM instead of one.

#### H4. Shared Redis cache backend for Django
**Where**: `backend/config/settings.py` — no `CACHES = {...}` setting, so Django uses `LocMemCache`.
**Current state**: The Supabase auth userinfo cache in `config/authentication.py` uses `django.core.cache.cache` which is per-process LocMemCache. Each gunicorn worker has its own cache, so the 60s TTL is effectively halved for cache-hit purposes. Doubles (or worse) the RPS to Supabase `/auth/v1/user`.
**Impact**: Under burst load, Supabase auth is hit 2–3× more than it needs to be. May run into Supabase rate limits on the project's plan.
**Fix**: Add `CACHES = { 'default': { 'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': os.getenv('REDIS_URL') } }`. Redis is already provisioned (Celery uses it). One-time config change, shares auth cache across all gunicorn workers (and any future Celery worker).
**Effort**: **S (30 min + test)**.
**Risk if unfixed**: Excess Supabase auth RPS under load. Possible rate limiting.

---

### MEDIUM — worth doing during beta, not blocking

#### M1. Frontend silent `.catch(() => {})`
**Where**: 4 sites in frontend: `AuthContext.tsx`, `lib/api-client.ts`, `UnifiedBIMViewer.tsx` (2). One of these (`UnifiedBIMViewer.tsx:1193`) just hid a broken FastAPI CORS config for hours — we found it by reading Railway logs, not the frontend.
**Fix**: Each silent catch should either log via `console.warn('[component] context:', err)`, surface a toast/banner, or re-throw. None of them are "expected" failures where silence is correct. Skip only the one in `api-client.ts:40` which is the deliberate "swallow during signOut" path, and even that should log.
**Effort**: **S (20 min)**.
**Risk if unfixed**: Next bug that hides in a silent catch wastes an hour of debug time.

#### M2. Backend `except Exception:` audit
**Where**: 144 `except Exception`-style blocks across 30+ backend files. Many are in `backend/ifc-service/services/ifc_parser.py` (21 alone), `room_stitch.py` (9), health_check/validation executors (~50).
**Fix**: Not a mass refactor. Pick the ones in request-path code (FastAPI endpoints, Django views) and confirm they re-raise or log with enough context. Defer the rest to post-beta — they're in batch/worker code where silence is less dangerous.
**Effort**: **M (2–3h)** if done carefully.
**Risk if unfixed**: Same as M1 — hidden failures burning debug time. Lower priority since backend logs are already captured to Railway.

#### M3. Rate limiting on FastAPI endpoints
**Where**: FastAPI has no rate limiting middleware.
**Current state**: Django has DRF throttling (`anon 60/min`, `user 600/min` per `docs/worklog/2026-04-14-03-53_...`). FastAPI has nothing. Once C3 adds auth, throttling should come with it.
**Fix**: `slowapi` package is the standard FastAPI rate limiter. Redis-backed so it shares state across workers.
**Effort**: **S (1h)**.
**Risk if unfixed**: Once C3 lands and the endpoint is authed, this is less critical. Without C3 it's already covered there.

---

### LOW — accept for beta

#### L1. Frontend bundle size
**Where**: `dist/assets/index-*.js` — 7.4 MB raw, 1.6 MB gzipped, single monolithic chunk.
**Current state**: Vite warns about "some chunks larger than 500 kB". Three.js + ThatOpen Components + IfcOpenShell-wasm all in one bundle.
**Fix**: Code-splitting via dynamic `import()` for the viewer path, route-level splitting in `App.tsx`. Vercel caches gzipped, so cold-start tax is ~1.5 MB one-time per user.
**Effort**: **M (3–4h)**.
**Risk if unfixed**: First paint is slower on slow connections. Not a scale bottleneck — Vercel CDN handles it.

#### L2. Local JWT verification
**Where**: `backend/config/authentication.py` currently delegates to Supabase `/auth/v1/user` on every cache miss (60s TTL).
**Current state**: The previous Claude session fought with Supabase JWT signing keys and settled on delegation because the keys are rotating / opaque. That was the right call under time pressure.
**Fix**: Proper JWKS-based local verification. Fetch Supabase's JWKS endpoint periodically (hourly), cache the keys, verify tokens locally with `PyJWT[crypto]`. Removes the entire Supabase network dependency from the auth hot path.
**Effort**: **L (6–10h)**. Needs testing against Supabase's rotating key behavior.
**Risk if unfixed**: Paired with H4 (shared Redis cache), the current delegation is fine for beta. Revisit post-beta.

---

## Recommended execution order

**Before inviting any testers (CRITICAL)**:
1. C1 — Celery worker service (1h)
2. C2 — FastAPI cache bounds + `to_thread()` (3–4h)
3. C3 — FastAPI auth (1–2h with internal key)

**Before inviting >20 testers (HIGH)**:
4. H3 — FastAPI `--workers 3` (5 min)
5. H1 — Gunicorn worker tuning (15 min)
6. H2 — `conn_max_age=60` (15 min)
7. H4 — Redis cache backend for Django (30 min)

**During beta, as time allows (MEDIUM)**:
8. M1 — Silent catches (20 min)
9. M2 — Selective backend except-audit (2–3h)
10. M3 — FastAPI rate limiting (1h, bundled with C3)

**Total CRITICAL + HIGH**: ~6–8 hours of focused work.

This takes the platform from "will break at 20–50 concurrent" to "probably handles 100–200 concurrent, gracefully degrading above that". No architectural rewrites needed. All of the above is configuration and small-code changes.

---

## Things I explicitly did not audit

- Supabase tier limits and actual auth RPS numbers (needs Supabase dashboard)
- Real RAM usage during FastAPI model loads (needs container metrics)
- Actual Django request latency distribution (needs APM / log analysis)
- Model upload flow end-to-end under burst (needs a real load test)
- Frontend Core Web Vitals on production (needs Lighthouse / WebPageTest)
- Viewer performance under many simultaneous connected clients

A proper load test with k6 or Locust hitting the top 5 endpoints (login, projects list, model list, viewer model load, element click) would validate or refute every estimate in this document. Single half-day effort after the CRITICAL fixes land.
