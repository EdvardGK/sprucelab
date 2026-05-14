# Tester findings sweep (Issue #12) — 6-wave plan

**Status**: planning · pinned by user 2026-05-14 after design-tokens unification took precedence
**Source**: [Issue #12](https://github.com/EdvardGK/sprucelab/issues/12) + [PR #11 worklog](https://github.com/EdvardGK/sprucelab/pull/11)
**Tester**: external Claude web session against live `sprucelab.io` on 2026-05-14
**Count**: 3 P0 + 6 P1 + 8 P2 = 17 distinct findings (a few merged here for shared fixes)

## Context

External-tester sweep filed 21 actionable findings. The session that received them was mid-design-tokens work, and the user explicitly redirected away from chasing the sweep here — design tokens needed to land first because the four-place palette duplication was actively producing visibly different color vocabularies between Types and Model dashes. The sweep now waits for a focused session per wave.

This plan is the canonical task source. Do NOT recreate as TaskCreate items unless actively working a wave — the task list should reflect current focus, not the long-horizon plan.

---

## Wave 1 — Frontend quick wins (one PR)

Each item ≤ 15 lines. Batched commit.

- [ ] **P0 #3** Sidebar Search no-op → tooltip "Cmd+K — coming soon" + drop the dev `console.log`; aria-label already present at `Sidebar.tsx:204`. (~3 lines)
- [ ] **P2 #12** 404 page unstyled → `errorElement` on root route in `App.tsx`; new `NotFound.tsx` styled like the design-token surfaces. (~30 lines new file)
- [ ] **P2 #14** i18next Locize promo log spam → explicit `debug: false` in `i18n/index.ts`; if that doesn't silence, install a noop logger via `i18next.options.logger`. (~3 lines)
- [ ] **P1 #9** Model thumbnails "No geometry" copy → INVESTIGATE FIRST. Current grep finds no matching string in the Models gallery; tester report may be from a different surface. Ask user for screenshot before changing copy.
- [ ] **P2 #15** Production logger at ERROR may hide warnings → no `loglevel` lib found in repo; investigate where the tester's claim comes from before changing anything.

**Files**: `frontend/src/components/Layout/Sidebar.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/NotFound.tsx` (new), `frontend/src/i18n/index.ts`.

## Wave 2 — Shared empty/error state primitives (one PR)

- [ ] **P0 #2** `/workbench?view=verification` and `?view=ifc-editing` render empty `<main>` → honest empty state with `<h1>` + status region (a11y).
- [ ] **P1 #4** QTO "Failed to load" on 200-OK `{count: 0, results: []}` → split empty-state from error-state.
- [ ] **P2 #13** Inconsistent error states across app → new shared `<EmptyState>` + `<ErrorState>` components; apply to Workbench, QTO, 404.

**Files**: `frontend/src/components/ui/EmptyState.tsx` (new), `frontend/src/components/ui/ErrorState.tsx` (new), `frontend/src/pages/BIMWorkbench.tsx`, QTO surface (locate during work).

## Wave 3 — Cross-filter scope + viewer count label (one PR)

- [ ] **P1 #8** `?d=base64(filter)` URL filter leaks across navigation. Project filter from `/models` (`ifc_class: [IfcDuctFitting]`) carries into `/types` where the model has zero DuctFittings — UI reads `0/297` with no banner connecting empty result to active filter. Fix options:
  - (a) Route-scope the URL key (`?d.models=...&d.types=...`) — more invasive
  - (b) Surface a "Filter from Models active · Clear" banner on every page (cheaper + aligned with the lead-filter idea from the color-system §5 wireframe)
  - Recommendation: (b) for now; revisit (a) after the lead-filter `order: string[]` ships.
- [ ] **P1 #7** 3D viewer "elements" count discrepancy (header 88,200 / filter panel 559,489 / model rows sum 88,200). The 559k is IFC entities (Psets etc.), not physical elements. Rename the filter-panel label or filter the count to physical-only.

**Files**: `frontend/src/contexts/ProjectFilterProvider.tsx`, `frontend/src/components/filters/FilterChips.tsx`, `frontend/src/components/features/viewer/ViewerFilterPanel.tsx` (count label).

## Wave 4 — Statistics aggregator P0 (multi-stack, one PR)

- [ ] **P0 #1** `/api/projects/{id}/statistics/` returns `element_count: 0`, `type_mapped_count: 0`, `material_mapped_count: 0`, `top_types: []`, `top_materials: []` while `/api/models/?project=…` rollup sums to 88,791 elements for the same project. Likely either:
  - A denormalized column on `Project` that never gets backfilled
  - A post-extraction signal that fires per-model but not at the project level
  - An aggregator view that joins on the wrong key
- Backend audit: read `apps/projects/views.py` (statistics endpoint), find the aggregator, run it against G55 in a shell to reproduce, fix root cause, add reanalysis pass for all 8 prod projects.
- Frontend follow-up: if any KPI tile relies on this endpoint, make sure the new values surface; add an "Updated Xs ago" pulse.

**Files**: `backend/apps/projects/views.py`, `backend/apps/projects/serializers.py`, possibly a new aggregator service, frontend KPI consumers (locate during work).

## Wave 5 — API base URL consolidation + auth-ready fetch gating (one PR)

- [ ] **P1 #5** Inconsistent base URL — SPA hits both `www.sprucelab.io/api/` (proxied) and `sprucelab-production.up.railway.app/api/` (direct) for the same endpoint. Causes a 403 race when JWT attaches after initial fetch.
- [ ] **P1 #6** Dashboard "load early, render late" — KPI cards take 4–8 s; Projects-list metric cards never resolved in the tester's session. Probably the same 403 race + missing auth-ready gate.
- [ ] **P2 #16** CORS preflight + JWT replay surface from direct Railway calls.

Fix: pick the proxied origin as the single base URL; remove any direct Railway hosts from `apiClient` / `ifcServiceClient`; introduce `useAuthReady()` gate so React Query fetches don't fire until JWT is attached.

**Files**: `frontend/src/api/api-client.ts`, `frontend/src/api/ifc-service-client.ts`, `frontend/src/contexts/AuthContext.tsx`, possibly Vercel `vercel.json` rewrites.

## Wave 6 — My Page real data + remaining a11y (one PR)

- [ ] **P2 #11** My Page placeholder fake stats ("2 active projects" when 3 exist) — wire to real `/api/projects/` count + show "coming soon" placeholders for unimplemented widgets.
- [ ] **P2 #17 (remainder)** A11y polish — Workbench empty pages need `<h1>` (covered in Wave 2); KPI traffic-light status needs icon+text pair, not color alone (use `STATUS` catalog glyphs from the new design tokens).

**Files**: `frontend/src/pages/MyPage.tsx`, `frontend/src/components/features/warehouse-v2/TypeKpiGrid.tsx`, `frontend/src/components/features/model-workspace/AnalysisKpiCluster.tsx`.

---

## Order of operations (recommended)

1. **Wave 1** — cheapest visible polish, surfaces zero broken affordances
2. **Wave 4** — P0 backend fix (statistics aggregator), unblocks every dashboard KPI
3. **Wave 2** — empty/error states (lots of pages benefit)
4. **Wave 5** — deploy plumbing (404 race + base URL); fixes the dashboard slowness from Wave 1's reports
5. **Wave 3** — cross-filter scope (also unblocks lead-filter ship from color-system PR 3)
6. **Wave 6** — My Page real data + remaining a11y

## Out of scope here

- Color system PR 3 (lead-filter `order: string[]` + chip glyph)
- Layer 3a grouping axes
- Settings shell (#10 from architecture session)
- Dashboard engine extraction (#14)

## Verification rule

Each wave: type-check + build + commit + push + Vercel + Railway + chrome-devtools spot-check on the affected surface. Per `feedback-verify-deploys-after-push.md`.
