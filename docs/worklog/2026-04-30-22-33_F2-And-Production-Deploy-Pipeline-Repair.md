# Session: F-2 storey deviation + production deploy pipeline repair

## Summary
Two threads landed in one long session. F-2 (storey-deviation verification + publish gate) shipped backend-only, 188 unit tests green. Then a routine "let's push to main and see Vercel deploy" triggered a 6-bug cascade where production had been silently broken for 15+ days. All six bugs found and fixed, production end-to-end functional for the first time in 2+ weeks. One small UI fix at the end (status pill overlapping chevron on model cards).

## Changes

### F-2 — storey deviation verification (backend, 6 files, 188 tests)
- `backend/apps/entities/services/verification_engine.py` — module-level `check_storey_deviation(model)` helper (rule_id `storey_match`). Mirrors `_reconcile_floors`: name/alias match → no issue; elevation within `storey_merge_tolerance_m` + name differs → warning; else → error. Canonical floors absent from the proposal → warning. Reads model.scope.canonical_floors and the latest `storey_list` Claim per source_file (ordered by `extracted_at`, NOT `created_at` — that field doesn't exist on Claim).
- `backend/apps/projects/models.py` + migration `projects/0007_projectconfig_block_on_storey_deviation.py` — new `ProjectConfig.block_on_storey_deviation` BooleanField.
- `backend/apps/models/views.py:ModelViewSet.publish` — gate insert before `model.publish()`. Returns HTTP 402 `{gate: 'storey_deviation', issues: [...]}` when flag on AND any error-severity issues. Warnings never block.
- `backend/apps/entities/views/types.py:dashboard_metrics` — appends synthetic per-model items to `action_items` with `type_id = f'model:{m.id}'`. No frontend changes needed; conforms to existing ActionItem TS contract. F-3 will replace with a `kind` discriminator.
- `tests/unit/test_storey_match_verification.py` — 13 new tests (175 → 188).

### Production deploy pipeline — 6 root causes fixed
1. **`frontend/vercel.json` ignoreCommand path bug**. Pathspec was `frontend/` but Vercel runs `ignoreCommand` from inside the project's Root Directory which IS `frontend/`. So git looked for `frontend/frontend/`, found nothing, exited 0, and Vercel cancelled every build. **Every deploy for the last 15 days was cancelled this way; production was pinned to a 15-day-old build.** Fix: changed pathspec to `.`.
2. **`railway.toml` startCommand `cd /app && ...`**. A 2026-04 Railway platform change stopped auto-shell-wrapping startCommand, so `cd` failed with "executable not found". Fix: wrapped in `sh -c "..."` (TOML literal string for sanity), dropped `cd /app &&` since Dockerfile WORKDIR handles it. Also enabled gunicorn `--access-logfile -` so we'd actually see hanging URLs.
3. **`fastapi_client.py` httpx default timeout 300s vs gunicorn `--timeout 120`**. Worker death-spiral: any Django view proxying a slow FastAPI call had gunicorn SIGKILL the worker before httpx returned. Fix: lowered httpx default to 90s (must stay below gunicorn's 120s).
4. **`ALLOWED_HOSTS` missing `healthcheck.railway.app`**. Railway's deploy probe sets `Host: healthcheck.railway.app`; Django returned 400 (DisallowedHost); Railway marked deploy FAILED after 5 retries. Fix: unconditionally append `healthcheck.railway.app` to ALLOWED_HOSTS in settings.py (encoded in code, not env, so a fresh deploy never needs to remember).
5. **`SECURE_SSL_REDIRECT` 301-redirected `/api/health/`**. Railway's healthcheck probes plain HTTP and doesn't follow 301s. Fix: `SECURE_REDIRECT_EXEMPT = [r'^api/health/?$']` keeps SSL redirect on for everything else.
6. **Root `railway.toml` was being applied to the FastAPI service too**, causing it to be built with `Dockerfile.django`, Django's gunicorn startCommand, and `/api/health/` healthcheck path — none of which match the FastAPI service. Every FastAPI deploy since 11:14 today silently failed this way. Fix: dropped a service-local `backend/ifc-service/railway.toml` inside the FastAPI Root Directory; service-local config wins over the repo-root one.

### UI fix — model card status pill / chevron overlap
- `frontend/src/pages/ProjectModels.tsx` — the status badge (end of a `flex justify-between` row) and the absolutely-positioned `ChevronRight` (`right-4 top-4`) shared the top-right corner with no offset, overlapping ~16px. Moved `pr-8` from the title `<p>` (where it didn't help with the badge) onto the flex container itself, reduced to `pr-7`. Math: chevron occupies card-right -16 to -36px; flex with pr-7 puts badge right at -48px, gives 12px gap.

## Technical details

**Why F-2's per-model issue surfaces as synthetic action items.** Existing `_check_rule(rule, ifc_type, ...)` is type-scoped. Storey deviation is model-scoped. Forcing it into the type loop would either fan the same issue across hundreds of types or smuggle a model param through a type-shaped signature. Cleaner to emit it as a parallel pass and let the dashboard_metrics endpoint stitch it into action_items with a `model:<id>` synthetic type_id. Frontend ActionItem contract requires `type_id: string`, uses it as a React key, never parses it — works without a frontend touch. F-3 will introduce a proper `kind` discriminator alongside the Floors UI.

**The deploy bug stack was a classic "broken for so long the next push exposes everything"**. Six independent regressions accumulated over weeks:
- The Vercel ignoreCommand bug was probably introduced when someone moved the project's Root Directory in Vercel's dashboard. Path stayed the same. Builds silently cancelled.
- The Railway `cd` issue was a platform-side change, not user code.
- The FastAPI client 300s timeout had been there since the multi-service split — only became visible when the new frontend started hitting Django→FastAPI proxy paths.
- ALLOWED_HOSTS and SECURE_SSL_REDIRECT issues are likely from when health endpoint was added or settings refactored. Worked fine before because Railway's healthcheck behavior was different.
- The FastAPI-service-reading-Django-railway.toml bug was the most subtle; Railway changed how it resolves config when `railway.toml` exists outside Root Directory.

**Worker-timeout death-spiral diagnosis chain**: spotted the 120s pattern in old deploy logs (workers cycling exactly every 120s after spawn) → grepped for synchronous HTTP calls in Django → found `fastapi_client.py:46 timeout: float = 300.0` → recognized the cascade. The 90s default is defense-in-depth: any caller that genuinely needs >90s should be moving to Celery anyway.

**Vercel CLI verification** was the move that made progress here. `gh api .../check-runs` showed only Supabase ran on every main commit — no Vercel checks. That looked like Vercel wasn't installed. But `vercel ls` revealed the build *was* running (and being canceled in 2-3s). Without the CLI, I'd have been stuck looking at GitHub for evidence.

**The user explicitly said "dont hide flaws. find them and fix"** when I tried to summarize root causes without acting. Pivoted to push every fix end-to-end. That's the correct move — degraded production isn't a status report, it's an action item.

## Next

### F-3 — frontend approval + viewer wiring (~1 session)
Still pending from F-1 plan. ClaimInbox dedicated `storey_list` renderer, Floors settings page (per-scope canonical edit, deviating-models drill-down, promotion history), `useViewerFilterStore.floor_code` migration, `GET /api/projects/scopes/{id}/floors/` endpoint.

### Investigate slow endpoints
Now that gunicorn access logs are on, one day of traffic should reveal which endpoints are slow. Worth scheduling a sweep in 24-48h.

### Cleanup
- `apps/models/views.py:_get_local_file_path` is dead code (no callers found). Safe to delete.
- `frontend/src/components/features/viewer/ElementPropertiesPanel.tsx` is type-only post-viewer-unification — move `ElementProperties` to `types/viewer.ts` and delete.
- Bare `requests.get(...)` calls in Celery tasks (`tasks.py:33`, `automation/tasks.py:85`) lack timeouts. Lower priority since Celery doesn't have gunicorn's worker timeout, but a hung task ties up a Celery worker indefinitely.

## Notes
- F-2 plan file: `~/.claude/plans/continue-where-we-left-compiled-tiger.md`. Phase F-2 is complete per that plan.
- Six fixes pushed today landed in this commit chain on main: `9be3006 → a9b567f → 4b236c4 → 21db6f3 → 90003d3 → f82bac6 → 9fbf161`.
- 188 unit tests green throughout. No regressions.
- The F-2 work itself shipped to dev and to main *before* the deploy issues surfaced — F-2 backend is live in production now too.
- Production URLs verified working at session end: `sprucelab.io` 200, `www.sprucelab.io` 200, `sprucelab-production.up.railway.app/api/health/` 200, `fast-api-production-474b.up.railway.app/api/v1/health` 200, all aliases consistent.
- `api.sprucelab.io` returns 404 DEPLOYMENT_NOT_FOUND — DNS pointed at Vercel with no deployment behind it. Frontend doesn't actually call this URL (JS bundle hits Railway directly), but it's a leftover that should be cleaned up.
