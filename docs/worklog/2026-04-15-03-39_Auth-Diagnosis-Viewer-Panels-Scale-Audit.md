# Session: Auth Bugs, Viewer Panels, and Pre-Beta Scale Audit

## Summary
Debugged three production issues reported while Phase 1 was running live on `sprucelab.io`, shipped each fix, then ran a pre-beta scale audit that surfaced three operational landmines the platform would hit at very low concurrency. Core theme: the platform is not as production-ready as it looks, and the gaps are all configuration-level, not architecture-level — fixable in ~6-8h.

## Changes

### Fix 1 — Frontend auth-header leak (root cause of "model not found" 401s)
- `frontend/src/lib/authed-fetch.ts` — NEW. Thin `fetch()` wrapper that attaches the current Supabase access token as `Authorization: Bearer` via `supabase.auth.getSession()`. For code that needs `arrayBuffer()` where axios is awkward. Does NOT touch external Supabase Storage signed URLs.
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` — replaced 3 raw `fetch(\`${API_BASE}/...\`)` calls (model metadata, fragments endpoint, generate_fragments POST) with `authedFetch`. Error path now distinguishes 401/403 ("Authentication required — please sign in again") from 404 ("Model not found") from generic HTTP failure — stops flattening auth errors into data errors.
- `frontend/src/components/features/warehouse/TypeInstanceViewer.tsx` — 4 raw `fetch` sites routed through `authedFetch`, same error-message split.
- `frontend/src/components/features/warehouse/MaterialLayerEditor.tsx` — 1 raw `fetch` POST for type-definition-layer bulk-update routed through `authedFetch`.
- `frontend/src/lib/api-client.ts` — on 401 the interceptor now calls `supabase.auth.refreshSession()` and, if refresh fails or yields no session, `signOut()` + `window.location.replace('/login')`. No more zombie-shell state where the user sees app chrome while every API call silently 401s.
- `frontend/src/contexts/AuthContext.tsx` — `signUpWithPassword` now calls `supabase.auth.signOut()` before `signUp()`. Prevents the test-methodology trap where signing up as a new user while already logged in as a superuser just leaves you logged in as the superuser (which was 100% of my earlier "gate bypass" diagnosis dead end).

### Fix 2 — Model Workspace dashboard scroll
- `frontend/src/pages/ModelWorkspace.tsx:132` — tab content container `overflow-hidden` → `overflow-y-auto`.
- `frontend/src/pages/ModelWorkspace.tsx:260-261` — OverviewTab wrapper `h-full overflow-hidden` → `min-h-full`. Grid `h-full` → `min-h-full`. The `1fr` row still fills available viewport on tall screens; on short screens content grows beyond viewport and the outer container scrolls.
- User clarified the CLAUDE.md scroll rule: "the rule isn't that you shouldn't be able to scroll if there is content that needs scrolling — the rule is to avoid content that needs scrolling". Dashboard-fit is still the design goal; scrolling is now a graceful fallback when content genuinely can't be squeezed smaller. CLAUDE.md left untouched per user decision.

### Fix 3 — IFCPropertiesPanel "always render with placeholders"
- `frontend/src/components/features/viewer/IFCPropertiesPanel.tsx` — every sub-component used to `return null` when its data slice was empty, so a model with thin metadata showed only the identity card. Now:
  - `SpatialPath` — always renders Site → Building → Storey, shows `—` (dimmed) for missing parts.
  - `QuantityGrid` — always renders all configured slots for the IFC class, `—` (opacity 0.4) for missing values; primary highlight only when the primary value is present. Fallback `buildFallbackQuantities` returns 5 default slots (area/length/height/thickness/volume) instead of filtering.
  - `KeyPropertiesGrid` — `extractKeyProps` now always returns 4 slots (IsExternal / LoadBearing / FireRating / U-value); missing slots show `—` dimmed instead of being dropped.
  - `PsetDropdown` — shows "No property sets" in a disabled trigger when empty, italic placeholder row below.
  - `MaterialLayers` — shows a dashed-border "No material layers defined" box when empty.
- Added `MISSING = '—'` constant at module top.

### Fix 4 — FastAPI CORS allowlist (root cause of blank data panels)
- `backend/ifc-service/config.py:38-45` — `CORS_ORIGINS` had `sprucelab.no` / `www.sprucelab.no` (old domain that never shipped) plus `sprucelab.vercel.app`. Replaced with `sprucelab.io` + `www.sprucelab.io`. The hardcoded `allow_origin_regex` in `main.py:61` already covers Vercel previews (`sprucelab-<hash>-skiplum.vercel.app` matches `sprucelab(-[a-z0-9]+)*\.vercel\.app`), so no change there.
- Railway auto-deployed FastAPI from `main`.

### Pre-beta scale audit doc
- `docs/plans/2026-04-15-00-00_Scale-Audit-For-Beta.md` — NEW. Static audit (no load test) of FastAPI, Django, Celery, gunicorn, DB pool, cache, silent error paths. Ranked CRITICAL / HIGH / MEDIUM / LOW with effort estimates and risk-if-unfixed. Total CRITICAL+HIGH = ~6-8h to reach "comfortable 100-200 concurrent".

## Technical Details

### The diagnosis chain (most of the session's time)

**Blank panels in the full-page viewer** turned out to be a cascade of four unrelated-looking symptoms that all shared one root cause. The diagnosis sequence matters because I almost went down two wrong paths before landing on the real bug:

1. **Reported symptom**: "panels are more or less empty when I click elements in the 3D viewer".
2. **First hypothesis (wrong)**: the `IFCPropertiesPanel` sub-components all `return null` on empty data. I fixed this as "Fix 3" above — it IS a real UX bug (blank sections hide the fact that the model genuinely has missing metadata), and the fix is correct. But it treated the symptom, not the cause.
3. **Next hypothesis**: trace `ElementProperties` back through the selection handler in `UnifiedBIMViewer.tsx:573` (`fetchAndDisplayProperties`). The function tries FastAPI first via `ifcService.getElementByExpressId(loadedModel.ifcServiceFileId, expressID)` and falls back to a minimal `{ expressID, type: 'Unknown', name: 'Element X' }` placeholder on any failure. The fallback is exactly what the user was seeing.
4. **Why was FastAPI failing?** `loadedModel.ifcServiceFileId` is set at `UnifiedBIMViewer.tsx:1188-1194` via a fire-and-forget `ifcService.openFromUrl(absoluteUrl).then(r => { loadedModel.ifcServiceFileId = r.file_id; }).catch(() => {})`. The `.catch(() => {})` is silent — any failure leaves `ifcServiceFileId` permanently undefined.
5. **Why was `openFromUrl` failing?** Checked Railway logs on the `Fast API` service. Found dozens of `OPTIONS /api/v1/ifc/open/url HTTP/1.1 400 Bad Request` — CORS preflight rejected. Browser sends OPTIONS first because `POST` with `Content-Type: application/json` is a non-simple CORS request. Preflight fails → browser blocks the POST → silent catch swallows it → `ifcServiceFileId` stays undefined → every click falls through to the "Unknown" placeholder → `IFCPropertiesPanel` sub-components all hit `return null` → blank panel.
6. **Root cause**: `CORS_ORIGINS` in `ifc-service/config.py` still listed `sprucelab.no` (old domain) instead of `sprucelab.io`. Same "stale config from before the domain cutover" pattern as the Vercel env vars fixed in the 2026-04-14 Phase 1 session. One-line fix.

**Lesson captured in the audit**: the silent `.catch(() => {})` hid this for hours. If it had logged or raised a banner, I'd have seen it on day one of the domain cutover. Added to the audit as M1.

### The auth 401 diagnosis (earlier in the session)

Separate bug chain, also worth recording:

- User reported: "model dashboards have content that is taller than viewport but is locked to viewport, I need to be able to scroll". Plus: "console errors in production" with a paste of:
  ```
  /api/me/:1  Failed to load resource: 401
  [api-client] 401 from backend — session may be stale
  Failed to load model b9c137b9-… not found
  ```
- My first hypothesis was wrong twice: first I thought it was a stale-localStorage issue, then I thought it was a waitlist-approval-gate bypass (because the user also said "the landing page where you wait for acceptance is not working, it just let me in").
- Spent a while chasing the gate-bypass angle, built a diagnosis flow, asked for the `/api/me/` JSON. Used Railway Postgres CLI (`PGPASSWORD=... psql ...aws-1-eu-north-1.pooler.supabase.com 6543`) to query:
  - `auth.users` (Supabase) — confirmed `ed.expense@gmail.com` exists, email confirmed, but `last_sign_in_at = NULL`.
  - `auth_user` + `accounts_userprofile` (Django) — confirmed `ed.expense` has NO Django row. `_get_or_create_user` in `config/authentication.py` was never triggered because no authenticated API call ever reached Django from that account.
- **The "gate bypass" was a false alarm**: user was testing signup while still logged in as `edvard.kjorstad@skiplum.no` (approved superuser), so the new Supabase identity was never signed in, the browser kept the existing session, and every navigation showed the app as edkjo. The "just let me in" UX was actually "you were already in".
- **The real bug behind the 401s** was the viewer-without-auth-header issue (Fix 1). Raw `fetch(\`${API_BASE}/...\`)` calls in `UnifiedBIMViewer`, `TypeInstanceViewer`, and `MaterialLayerEditor` were introduced pre-Phase-1 when Django had no auth requirement. After Phase 1 added `IsApprovedUser` as the default permission class, those requests silently started returning 401. The error handler flattened it to "Model not found" which masked the auth issue.
- Fixed methodology problem as well via the `signUp()`-does-`signOut()`-first change in `AuthContext.tsx`, so the user can no longer trip the same test trap.

### Scale audit discoveries (details in the plan doc)

Three findings genuinely surprised me:

1. **Celery worker has been offline since 2025-12-15.** Confirmed via `django_celery_results_taskresult` — last row is `process_ifc_lite_task` success on 2025-12-15 18:29. `railway.toml` only defines the Django web service. Every `.delay()` call since then (`generate_fragments_task`, `run_model_analysis_task`, `enrich_model_task`, `revert_model_task`) has been queuing to Redis with no consumer. This explains why the viewer's "fragments fast path" at `/api/models/<id>/fragments/` returns nothing and every load re-parses the raw IFC. Platform survived because Session 031's types-only architecture moved model parsing out of Celery into FastAPI's synchronous request path.
2. **`IFCLoaderService._cache` is an unbounded dict.** Docstring claims "Redis stores file_id -> file_path mapping for TTL management" but the code just does `self._cache: Dict[str, ifcopenshell.file] = {}` and never evicts. Plus `ifcopenshell.open()` is a blocking C call running inside async FastAPI handlers — blocks the event loop for the entire parse duration. 10-30 concurrent users loading different models = OOM + everyone-stalled.
3. **FastAPI IFC service has no authentication on any endpoint.** `IFC_SERVICE_API_KEY = "dev-api-key-change-in-production"` in config.py is the tell — it was never wired up. Anyone on the internet can POST a URL to `/api/v1/ifc/open/url` and tell FastAPI to download and load arbitrary files into memory. SSRF + DoS vector on the public Railway subdomain.

### Railway CLI ergonomics

- `railway logs --service "Fast API" --lines N` works for historical logs. `railway logs` alone streams but never terminates — bad for scripting, don't use in Bash tool without backgrounding.
- `railway service list` doesn't exist; `railway service` is interactive and fails without a TTY; `railway deployment list --json` works and is the programmatic path.
- `railway variables --kv` emits `KEY=value` lines, usable for grep. Without `--kv` it boxes the output in unicode and truncates long values.

## Next

1. **Execute the audit's CRITICAL section** — user approved "go ahead" on the audit; not yet approved execution of the fixes. Recommended first step: **C1 Celery worker** (1h, zero-risk Railway config change, immediately unblocks fragments caching). Then **C2 FastAPI cache bounds + `asyncio.to_thread()`** (3-4h). Then **C3 FastAPI auth with internal shared key** (1-2h).
2. **Load test after CRITICAL lands** — half-day k6 or Locust pass against login, projects list, model list, viewer model load, element click. Validates / refutes every effort estimate in the audit doc.
3. **HIGH section before inviting >20 testers** — gunicorn worker tuning, `conn_max_age=60`, FastAPI `--workers 3`, Redis cache backend for Django. All small, ~1h total.
4. **MEDIUM during beta** — silent catches sweep (M1, 20 min), selective backend except-audit (M2), FastAPI rate limiting once auth lands (M3).
5. **Revisit CLAUDE.md scroll rule language** if the "scroll as fallback" pattern proves to be the right pattern after more dashboards ship. User said "could be I'm wrong" about the clarification, so leaving it open.

## Notes

- **The auth-header-missing bug was the real "why is my viewer broken"** throughout this session. Every downstream symptom (401s, "model not found", blank panels after CORS fix) traced back to code that predated Phase 1 auth and was never updated. Worth a dedicated sweep: grep for any remaining `fetch(\`${API_BASE}/...\`)` or `fetch(\`${DJANGO_BASE}/...\`)` call anywhere in the frontend and confirm they go through `authedFetch` or `apiClient`. I fixed 8 sites this session; there could be more in code paths I didn't touch.
- **The viewer stale-fragments issue is going to magically resolve** the moment the Celery worker starts running. `generate_fragments_task.delay()` fires on every successful model load (`UnifiedBIMViewer.tsx:1238`) — once the worker consumes it, the `/api/models/<id>/fragments/` endpoint will return a signed URL and the fast path will kick in. Means the "every load re-parses raw IFC" complaint (which has been slow for months) will disappear as soon as C1 ships. Worth a direct check post-deploy.
- **User's testing methodology blindspot**: logged in as superuser in the same browser while testing signup. The `signOut()`-before-`signUp()` fix handles this at the code level, but worth noting for future sessions — if a user ever says "I signed up and it just let me in", ask about browser state before investigating the gate.
- **The "Supabase JWT delegation" auth strategy from the Phase 1 session is working fine** but is tied to a 60s cache TTL backed by per-worker LocMemCache. Paired with Redis cache (H4 in audit), this becomes fully shared across workers. Post-beta, consider moving to proper JWKS-based local verification (L2 in audit, ~6-10h) — removes the entire Supabase network dependency from the auth hot path.
- **Three deploys shipped to `main` this session**: `4dc7fa6..98cc7a0` (auth-fix bundle), `a2daa52..7c59781` (scroll fix + panel placeholders), `7c59781..f7f8121` (FastAPI CORS fix). All three autodeployed cleanly to Railway + Vercel. `sprucelab.io` is live with all fixes.
- **Tasks completed in this session** (from the task list): #1-#6 for the auth fix cluster, #7-#11 for the scale audit. All marked complete before session end.
