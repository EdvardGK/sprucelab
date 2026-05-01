# Session: F-3 frontend approval + viewer wiring (with prod-deploy verification)

## Summary
F-3 closes the canonical-floors loop end-to-end. Backend: new `GET /api/projects/scopes/{id}/floors/` returns canonical_floors + per-model proposed/issues, reusing `check_storey_deviation`. Frontend: dedicated `storey_list` claim diff renderer in the Claim Inbox, a new Project Dashboard "Floors" tab with deviating-models drill-down + verification-gates editor, and `useViewerFilterStore.storey` → `floor_code` migration with optional canonical-alias map for federated models. 194 unit tests green (188 → 194). Push went clean — Vercel `Ready` (not Cancelled, the bug from yesterday holds fixed), Railway Django + FastAPI both healthy, new `/floors/` route registered (401 vs 404 sanity-check passes).

## Changes

### Backend (3 files)
- `backend/apps/projects/views.py` — new `@action(detail=True, methods=['get'], url_path='floors')` on `ProjectScopeViewSet`. Per-model loop reads the latest `storey_list` Claim per source_file, parses `normalized.floors`, calls `check_storey_deviation(model)` for issues. Response: `{scope_id, scope_name, storey_merge_tolerance_m, canonical_floors[], models[{model_id, model_name, source_file_id, proposed_floors[], issues[]}]}`.
- `backend/apps/projects/serializers.py` — `ProjectConfigSerializer` / `ProjectConfigUpdateSerializer` / `ProjectConfigDetailSerializer` now expose `phase`, `block_on_new_types`, `block_on_storey_deviation`. PATCH from the new Floors-tab gate editor goes through `ProjectConfigUpdateSerializer`.
- `tests/unit/test_scope_floors_endpoint.py` — 6 new tests: empty payload, canonical round-trip, no-claim model, matching-claim clean diff, deviating-claim issues, multi-model mix.

### Frontend (10 files)

**New files:**
- `frontend/src/hooks/use-scopes.ts` — `useProjectScopes(projectId)`, `useScopeFloors(scopeId)`, plus types `CanonicalFloor`, `ProposedFloor`, `FloorIssue`, `ScopeModelFloors`, `ScopeFloorsResponse`. Mirrors the keys-factory pattern from `use-claims.ts`.
- `frontend/src/components/features/claims/StoreyListClaimPanel.tsx` — canonical-vs-proposed table with per-row badges (`match` / `alias_merge` / `rename` / `new` / `missing`). Match logic mirrors backend `check_storey_deviation` exactly: name/alias match → match (or alias_merge if matched via alias), elevation within `storey_merge_tolerance_m` → rename, otherwise → new. Reverse pass for canonical floors not in the proposal → missing.
- `frontend/src/components/features/projects/ProjectFloorsTab.tsx` — three sections: canonical floors table (code / name / elevation / aliases), deviating-models list with per-issue messages (severity-colored), and a verification-gates editor that PATCHes `block_on_storey_deviation` on the active project config and `storey_merge_tolerance_m` on the root scope. Number input commits on blur.

**Modified files:**
- `frontend/src/lib/claims-types.ts` — `ClaimType` now includes `storey_list`; new `StoreyListProposal` interface; `ClaimNormalized` carries an optional `floors` array.
- `frontend/src/components/features/claims/ClaimDetail.tsx` — switches on `claim.claim_type === 'storey_list'` to render `<StoreyListClaimPanel>` in place of the generic normalized-triple grid. All other claim types unchanged.
- `frontend/src/stores/useViewerFilterStore.ts` — `storey` → `floor_code`, `setStorey` → `setFloorCode`, persist key bumped `sprucelab-viewer-filter` → `sprucelab-viewer-filter-v2` so stale localStorage drops on first load.
- `frontend/src/hooks/useViewerFilterUrl.ts` — encoded payload key `s` → `fc`. Both encode and decode paths.
- `frontend/src/components/features/viewer/ViewerFilterPanel.tsx` — new `canonicalFloors` prop. When provided, the Storey section renders canonical entries (label = name, value = code, with elevation suffix); otherwise falls back to the existing discovered-storey list. Active facet count + reset button work the same.
- `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx` — prop renamed `storeyFilter` → `floorCodeFilter`; new optional `floorAliases?: Record<string, string[]>` (canonical code → list of acceptable storey names). Hide/show effect: if `floorAliases[floorCodeFilter]` resolves, build the union of `storeyInfo` matches (case-insensitive) and call `hider.set(true, …)` per entry; otherwise treat the value as a literal storey name (preserves single-model and pre-canonical-floors behavior).
- `frontend/src/pages/FederatedViewer.tsx` — pulls scopes via `useProjectScopes`, picks the root scope, calls `useScopeFloors`, builds `floorAliases` (`code` → `[name, ...aliases]`), passes both `canonicalFloors` and `floorAliases` down. Filter pill `id: 'storey'` → `id: 'floor'` with label `code + name` when canonical, raw value otherwise.
- `frontend/src/pages/ModelWorkspace.tsx` — single rename `storeyFilter={…}` → `floorCodeFilter={…}` (this consumer never has aliases — falls through to literal-name mode).
- `frontend/src/pages/ProjectDashboard.tsx` — fourth tab (`Floors`) renders `<ProjectFloorsTab>`.
- `frontend/src/i18n/locales/en.json` and `nb.json` — new top-level `floors` namespace (`tab`, `canonical`, `proposed`, `scope`, `noCanonical`, `code`, `name`, `elevation`, `aliases`, `models`, `noDeviations`, `settings.{title, blockOnDeviation, blockOnDeviationHint, mergeTolerance, mergeToleranceHint, saved, saveError}`, `diff.{title, tolerance, status, empty, noScope, kind.{match, alias_merge, rename, new, missing}}`); `claims.types.storey_list` added in both locales. Norwegian uses proper æ/ø/å.

## Push + infra verification
Local validation: 194 pytest passes; `yarn build` (tsc + vite) clean. Commit chain: `aacbf4f` (backend) → `c4ade7d` (storey_list panel) → `452f808` (floor_code rename) → `461fa7c` (Floors tab). Pushed `dev` then merged into `main` with `--no-ff` (`85f9212`).

Verification:
- `gh api repos/EdvardGK/sprucelab/commits/main/check-runs` → `Supabase Preview: completed/success`.
- `npx vercel ls` → top production deploy `Ready` (not `Canceled` — the path-fix from yesterday holds).
- `curl https://sprucelab.io/` → 200, served bundle `assets/index-DfqlFeJr.css` matches the local build hash exactly. Pre-deploy hash was `index-CtYa03yc.css` — confirmed swapped.
- `curl https://sprucelab-production.up.railway.app/api/health/` → 200. New `/api/projects/scopes/<uuid>/floors/` returns 401 (auth required); a sibling bogus path returns 404 — proves the new route is registered.
- `curl https://fast-api-production-474b.up.railway.app/api/v1/health` → 200, `{status: healthy, ifc-service, 0.1.0}`.

## Technical details

**Why the storey-name → canonical-code translation lives in UnifiedBIMViewer, not the store.** The store's value semantically is "the user's floor selection." For projects without canonical floors (single-model uploads, fresh projects), the only stable identifier is the IFC storey name itself. Forcing every consumer to canonicalize first would either gate the viewer on a backend round-trip per model (slow) or break ModelWorkspace.tsx (no scope context available). The chosen split: store holds an opaque string; the viewer accepts an optional alias map and resolves on hide/show. Federated viewer with canonical floors → store sets `code`, viewer resolves to multiple storey names per model. Single-model viewer → store sets `name`, viewer matches that name directly. No mode flag, just a function on a falsy alias map.

**Why the persist-key bump matters.** Zustand's `persist` middleware reads the raw object from localStorage and merges it with the in-code initial. Renaming a field on the in-code shape from `storey` to `floor_code` would normally make every returning user start with `floor_code === undefined` *and* a leftover `storey` key flowing back into the type. Bumping `name` to `…-v2` drops the v1 record entirely. Acceptable cost — viewer filter state is ephemeral session UX, not durable data.

**Why ProjectConfig had to be patched even though it's a JSON model.** `block_on_storey_deviation` was added in F-2 as a real BooleanField (migration `projects/0007`), not a JSON config key. So PATCHing it through the existing `/api/projects/configs/<id>/` endpoint required adding the field to `ProjectConfigUpdateSerializer.fields`. Did the same for `phase` and `block_on_new_types` while there — those gates were similarly invisible to the API.

**Production verification chain mirrors the F-2-bug-cascade lessons.** Yesterday's debugging chain proved Vercel CLI `ls` is the truth for cancelled-vs-ready; GitHub check-runs alone wouldn't have caught the silent cancellation. So the verification step here ran `vercel ls` first, confirmed `Ready` not `Canceled`, then matched the live bundle hash against the local build hash to prove Vercel actually served the new bundle (not a cached stale one). Bundle hash `DfqlFeJr` matched both ends — green.

**Type-vs-route disambiguation on the new endpoint.** A 401 from a fresh route doesn't *prove* the route exists — it could be the global auth middleware firing before routing. Resolved by also probing a sibling-but-bogus path `/api/projects/scopes/<uuid>/this-route-does-not-exist/`, which returned 404. Different status codes prove DRF's URL resolver runs before the auth check on the not-found branch, so `floors/` returning 401 is route-confirming.

## Next

Pulled into `next-steps.md`. Highlights:
1. **`ActionItem.kind` discriminator refactor.** Replace the synthetic `type_id: 'model:<id>'` from F-2's dashboard_metrics with a proper `kind: 'model' | 'type'` discriminator. Touches the React contract + serializer.
2. **Slow-endpoint sweep on gunicorn access logs.** Now ~24h overdue after the F-2 deploy-pipeline repair turned access logging on.
3. **Promotion-history UI for canonical floors.** `_promoted_from_claim` and `_promoted_at` already populated; just unrendered.

## Notes
- F-3 plan file: `~/.claude/plans/great-keep-pushing-but-streamed-ocean.md`. All scope items shipped.
- Commit chain on `main`: `9fbf161 → aacbf4f → c4ade7d → 452f808 → 461fa7c → 85f9212`.
- `ProjectFloorsTab.tsx` uses an inline `ProjectConfigRow` interface and a one-off query key rather than introducing a `use-project-configs.ts` hook file. Reasonable now (one consumer); revisit if the gate editor moves elsewhere.
- The viewer hide/show effect compares against `storeyInfo` keys case-insensitively — small change, but prevents an "Etg 1" canonical alias from missing an "ETG 1" IFC storey name. Existing literal-name mode now also benefits (was case-sensitive before).
- Build emits a chunk-size warning (>500 kB) on the main bundle. Pre-existing, not introduced this session.
