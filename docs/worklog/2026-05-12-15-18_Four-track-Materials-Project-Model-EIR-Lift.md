# Session: Four-track lift — Materials + Project dash + Model dash + EIR polish

## Summary

Coordinated, parallel multi-agent session lifting three lagging
frontend surfaces (Materials, Project dashboard, Model dashboard) plus
the queued EIR-builder polish items from yesterday — all to
Type-page v2 quality. Four agents ran concurrently in isolated git
worktrees with hard file-scope walls and unique i18n namespaces.
Zero functional collisions; two trivial JSON-close-brace conflicts
resolved at merge.

Final state on `main`: commit `e2dec7a`. Six new commits
(`dba7710` … `e2dec7a`), four `--no-ff` merge commits. Live on
Vercel + Railway, all four route chunks present and i18n namespaces
verified in production bundles.

## Why it matters

The previous several sessions shipped a lot of plumbing (EIR rule
builder, claim system, viewer fragments v3, IDS interop). The visible
quality bar — the Type page v2 — only existed on one surface. After
this session, all four core project routes carry the same primitives:
`DashboardTile` + `DashboardGrid` wrappers, KPI grids with
`useCountUp` + `Sparkline` + tone rings, raw-counts framing with
amber em-dash for gaps (modelers-own-data principle), and clamp() for
all spacing/typography.

## Coordination architecture

What worked:

- **Worktree isolation per agent.** Each track had its own
  `.claude/worktrees/agent-*` checkout + branch. They couldn't see
  each other's WIP.
- **File-scope walls in the prompt.** Each agent got an explicit
  off-limits list of files OTHER agents owned. Zero unauthorized
  cross-track edits.
- **i18n namespace contract.** Each track wrote to its OWN top-level
  key (`materialBrowser.*` / `projectDash.*` / `modelDash.*` /
  `eirBuilder.*`). Auto-merge handled Track A + B cleanly; Tracks C
  and D each conflicted at the closing `}` of `en.json` + `nb.json` —
  resolved in seconds by stacking the namespaces.
- **One-build-per-track before commit.** Every agent ran
  `yarn tsc --noEmit` + `yarn build` in their worktree. Coordinator
  ran a single integration build after all merges — clean.

What to keep doing:

- The "specify off-limits" list in agent prompts beats "specify
  in-bounds." Agents respect a NO list more reliably than they
  respect a YES list when the codebase is large.
- Background `run_in_background: true` for parallel agents is the
  right default; serial waiting was unnecessary.

What broke a tiny bit:

- All four tracks edited the same trailing line of `en.json` and
  `nb.json`. Git's three-way merge resolved two collisions
  automatically and conflicted on two. Trivial to fix manually but
  predictable. Next time: have agents insert their namespace BEFORE
  a known-stable anchor, not append at end-of-file.

## Changes by track

### Track A — Materials page (commit `e83edd3`, merge `5612d7f`)

Hardcoded 5-stat header replaced with a 6-card KPI grid in
`DashboardGrid` + `DashboardTile` with `useCountUp`, `Sparkline`, and
tone rings. Family treemap added above the table with a tree↔treemap
toggle; click sets family filter. Flat detail panel converted to four
tabs (Definition / Layers / Where used / Readiness); Layers tab lifts
the compact stacked-bar idiom from `TypeDataRail`. Freshness badge
("Updated N min ago") in header via `dataUpdatedAt`. Coverage copy
reframed: `12 / 47 classified` with amber `—` for missing — no headline
percentages. Monolithic 933-line `MaterialBrowserView` split into 8
focused files; orchestrator ~410 lines.

Updated 2 e2e assertions in `tests/e2e/materials-browser.spec.ts` for
the new KPI grid copy.

### Track B — Project Dashboard (commit `dba7710`, merge `0de6d65`)

Bare `grid-cols-4` KPI cluster wrapped in `DashboardGrid` +
`DashboardTile` with `Sparkline` + `useCountUp` + tone rings.
TypeDashboard's health-score ring + classification/units/materials/
verification bars promoted above the fold via a new `HealthSignalsTile`
(BIM tab still has the full TypeDashboard for power users).
`AttentionFeedTile` reads from existing `useClaimsList` with
`status: 'unresolved'`, lists top 5 with explicit empty/error states.
`RecentActivityRibbon` shows last 10 model uploads with relative-time
+ status badge → click navigates to ModelWorkspace.
`DisciplineBarsTile` preserves the `setDiscipline()` cross-filter
dispatch but in a proper tile shell.

Also swapped the viewport-lock (`h-[calc(100vh-4rem)] overflow-hidden`)
for `min-h-` per CLAUDE.md's "no viewport locking" rule.

### Track C — Model Dashboard (commit `aec7db6`, merge `e2dec7a`)

Flattened `Overview > Dashboard` nesting — `AnalysisDashboard` is now
the direct content of the Overview tab, no inner sub-tab navigation.
QTO + Statistics promoted to peer top-level tabs. Stubbed sub-tabs
(MMI, Properties) removed entirely; Validation/Scripts/History tabs
re-styled with `ComingSoonTile` and per-tab roadmap copy.

New `AnalysisDetailsRail` (`w-[clamp(200px,14vw,300px)]`) mounts on the
right when a treemap tile is clicked — type name, IFC class chip,
instance count via `useCountUp`, mapping summary, NS-3451 badge,
material chips, storey distribution. Mirrors `TypeDataRail` visually
but rebuilt as a standalone file (wall stayed intact).

New `AnalysisKpiCluster` at top of AnalysisDashboard: Elements /
Storeys / Systems / Types / Untyped / Orphan, each in
`DashboardTile` + tone ring + `useCountUp` + mini `Sparkline`.

`StatisticsTab` implemented inline (no warehouse-v2 imports):
types-by-class bar chart, geometry-rep distribution, top-N table.

### Track D — EIR builder polish (commit `ce7c47b`, merge `11e0362`)

`?mode=view` / `?mode=edit` URL toggle on `ProjectSettingsPage`. View
mode hides the rule palette, drag handles, and X buttons; swaps form
inputs to a read-only `<dl>` renderer with amber em-dash for empty
values. Edit mode = today's behavior. Role gating reads
`user_metadata.role` / `app_metadata.role` from Supabase auth context;
editors/admins/owners can switch to edit. Falls back to "any authed
user" when no role plumbing exists — TODO comment placed for proper
membership wiring.

`EirRuleDefinition` gains `tier: 'oir' | 'air' | 'pir' | 'eir'` and
`responsibleRole: string`. Every existing rule tagged best-effort.
`EirRulePalette` gets a segmented control at top filtering by tier;
default = EIR. Empty-state copy per-tier in both locales.

New `EirIfcCubePreview` component: vanilla three.js (already in the
bundle for UnifiedBIMViewer — no new top-level dep). Extruded box
from `placement.basepoint_*` + `site_plan` extents (fallback 10×10×3 m
when missing), isometric camera, slow autorotate, anchored HTML Pset
labels. Renders side-by-side with the property tree in the IFC
preview tab. Disposes geometries/materials/edges/renderer on unmount;
cancels rAF; disconnects ResizeObserver. Combined Leaflet+three3D push
ProjectSettingsPage chunk to 410 kB / 130 kB gzipped.

## Verification

Live deploys 200 OK after push:

- `https://www.sprucelab.io/` — Vercel serving `index-REE9PUl6.js`
  (new hash, post-merge build).
- `https://sprucelab-production.up.railway.app/api/capabilities/` — 200
  with the expected `service: sprucelab-django` payload.

Per-route chunk verification:

```
200  62635   ProjectMaterialLibrary-CG6RuxYB.js
200  48161   ProjectDashboard-BhPIzvTu.js
200  868026  ModelWorkspace-Dtl9grqM.js
200  409736  ProjectSettingsPage-CWIJoD6x.js
```

i18n-key presence in production bundles (grep against each route
chunk):

- Materials: `materialBrowser.live`, `.kpi`, `.viz`, `.detail.tab`, `.missingValue`
- Project dash: `projectDash.attention`, `.recent`, `.kpi`, `.health`, `.disciplines`
- Model dash: `modelDash.rail`, `.stats`, `.kpis`, `.comingSoon`, `.roadmap`
- EIR builder: `eirBuilder.cube`, `.mode`, `.palette`, `.card`, `.workspace`

All four namespaces reached production.

## What's parked (intentionally not in this round)

From yesterday's worklog "Next" list:

- Address-search backend proxy + tile cache.
- Role-based onboarding-issue dispatcher.
- 3D site environment in UnifiedBIMViewer.
- `entity_ifc_type` field on `IFCType` (backend migration).
- BEP-builder route at `/projects/:id/bep`.
- `ProjectFilterProvider` facet expansion (material_status,
  verification_status).
- Materials viewer integration (deferred to avoid Track A/C viewer
  collision).

## Next

1. **Real-data walk-through on prod.** Open the four routes against a
   real project on `www.sprucelab.io`, capture console-error
   screenshots if any. (Memory: tests only on live; this is the actual
   QA pass for the round.)
2. **Materials viewer integration.** Now that the Materials page has a
   tabbed detail panel, the natural next step is an InlineViewer
   mount on the Definition tab that isolates instances of the selected
   material. Single-track, low risk.
3. **`ProjectFilterProvider` facet expansion** —
   `material_status` + `verification_status` — to make
   Materials and Verification first-class cross-filters across all
   three dashboards. Touches shared state, so single-track.
4. **BEP-builder route**. Phase 7 backend restore from
   `archive/` is the prerequisite (memory:
   `bep-eir-archive-restore-plan.md`). Mostly backend work; small FE
   route to mirror EIR builder once persistence exists.
5. **Worktree cleanup**. 28 stale agent worktrees + 4 from this
   session = 32 dirs under `.claude/worktrees/`. Use
   `git worktree prune --expire=now` after locking out the ones still
   needed; or `gio trash` the directories explicitly. Don't `rm`.

## Notes

- Plan file: `/home/edkjo/.claude/plans/lets-pick-up-where-fluttering-crown.md`
  captures the four-track design — keep around for the next
  multi-agent session as a template.
- The "specify off-limits files" pattern in agent prompts was the
  single biggest reason the merges were clean. Keep doing this.
- `HealthScoreRing` lives in the OLD `warehouse/` folder (not
  `warehouse-v2/`) and is shared across pages — Track B imported it
  directly. The original wall said "warehouse-v2/* read-only" — old
  warehouse is fine to import from. Worth a small consolidation pass
  later (move shared primitives to `components/dashboard/`).
- Track D's EIR cube has a slow autorotate. May feel distracting on
  prolonged viewing — easy to remove if the user dislikes it.
- Live verification took ~3 minutes for Vercel to rebuild after push.
  Plan ahead for that latency when shipping coordinator rounds.
