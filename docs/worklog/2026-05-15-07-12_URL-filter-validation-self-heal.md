# Session: URL filter validation — self-heal stale `?d=…` payloads

## Summary
Closed the loop on Track 3 UX 1c. Prior session shipped the amber `<FilteredEmptyBanner>` as a visible safety net; this session ships the root-cause fix so a stale deep-link `?d=…` no longer hydrates to a state that hides every row in the first place. The banner remains as defense-in-depth for predicates the validator can't see.

## Changes
- `frontend/src/hooks/useProjectFilterValidate.ts` (NEW) — one-shot post-hydrate validator. Takes a `FilterUniverse` (a per-dimension set of valid values) and a `ready` gate; when ready flips true, drops any dimension whose entire selected value-set misses the universe. Partial overlaps preserved.
- `frontend/src/pages/ModelWorkspace.tsx` — wired into `AnalysisDashboard`. Builds `ifc_class` + `floor_code` universes directly from `analysis.types[].element_class/type_class` + `analysis.storeys[].name` + `types[].storey_distribution[].storey`, mirroring the exact value-derivation that `filterAnalysisTypes` consumes.
- Commit `0092e2c`, pushed to main. Vercel deploy success at 05:10:30Z; new live bundle `index-Cxvksyr0.js` (was `index-DZdkwYX9.js` last verified). Railway healthy.

## Technical Details
**Where the fix lives.** Next-steps.md from the prior session pointed at `useProjectFilterUrl.ts:86-110`, but the right shape ended up being a separate hook called by the data-loading consumer. The URL hook runs at mount before any data is fetched; it can't possibly know what values are valid. The validator runs later, when the consumer (AnalysisDashboard) already has `analysis` non-null, so the universe is computable on the spot.

**Why only AnalysisDashboard, not also TypeBrowserV2 / FederatedViewer.** TypeBrowserV2's filter pipeline (`filterTypesV2`) reads local UI state (`searchQuery`, `ifcClassFilter`), not the URL-hydrated `ProjectFilterProvider` — its banner can fire on local-only filter states but URL hydration doesn't drive it. FederatedViewer reads URL filters but doesn't render the banner (it's a 3D canvas, not a list); stale predicates there cause "nothing visible" rather than an empty-list misread. Skipping FederatedViewer also avoids re-deriving the canonical-floor alias universe — a meaningful complication for a marginal win.

**Universe shape.** Conservative drop policy: only clear a dimension if the *entire* selection misses. Multi-select with one stale value keeps filtering on the remaining valid values. This avoids over-correcting an in-progress workflow where the user momentarily has a stale value among fresh ones.

**Verification.** `tsc --noEmit` clean (1713 files). `vite build` clean (18.2s). Vercel + Railway both reported success via GitHub Deployments API at SHA `0092e2c`. Live bundle hash on www.sprucelab.io shifted from the prior session's confirmed `DZdkwYX9` to `Cxvksyr0` — confirming the new build went out. Vercel's bot-challenge blocked direct curl on www.sprucelab.io for a portion of the session, so the deployments-API status was the primary signal.

## Next
1. **Re-verify prod dashboard-metrics latency** — last formal measurement was 3.6 s sequential / 7.5 s tail under 8-way load (pre-`15d0718`). New target is <500 ms over the ~480 ms Railway RTT baseline. With the freshly-converted `.frag` files in prod (last session) and URL filter validation now landed, this is the clean baseline. Network-panel pass on the 6089-type project, ~10 min.
2. **Polish: `--force` flag on `backfill_v3_fragments`** — a model stuck in `status=generating` from a prior session got skipped by the safety guard last session and needed a direct `trigger_fragment_generation()` call. Add `--force` to short-circuit the guard for that case.
3. **Viewer P0s** (lodSize cascade / Section Plane crash / DPR clamp) — still parked per `feedback-viewer-perf-rabbithole.md`; explicit ask required.
4. **Worktree cleanup** — `.claude/worktrees/` still holds 46 locked agent worktrees (14 G). Bulk destructive action; needs explicit user go.

## Notes
- FederatedViewer was deliberately left without validation. If users start reporting "viewer shows nothing after sharing a link", revisit with the canonical-floor alias map factored into the universe.
- The new hook fires only on the surfaces that import it, so adding to FederatedViewer later is purely additive — no refactor risk.
- Vercel's bot-challenge on direct curl from this machine is sticky enough that for any future "did the deploy land" checks, prefer the GitHub Deployments API path (gh api repos/.../deployments/{id}/statuses) over polling the live URL.
