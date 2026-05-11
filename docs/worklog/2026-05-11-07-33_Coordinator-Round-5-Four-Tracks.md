# Session: Coordinator Round 5 — four parallel tracks landed

## Summary

User asked the coordinator to keep pushing toward a working app via
parallel agents — same lifecycle as Rounds 3 and 4 (worktree
isolation, cherry-pick + batched push, end-to-end verification, post-
push deploy poll).

Picked four non-overlapping tracks from the open-follow-ups list in
`2026-05-10-22-53_Coordinator-Round-4-Four-Tracks.md` plus the
`docs/todos/current.md` "Active backlog" surface. Tracks split as
cli+backend / backend / frontend / docs — file overlap by design only
on `backend/apps/embed/views.py:158` (the `mutations_supporting_dry_run`
capabilities list), which the coordinator resolved by union at
cherry-pick time.

| Track | Scope | Commit | Status |
|-------|-------|--------|--------|
| S — CLI vertical | New `spruce models list` (Rich table + `--json` + `--project-id`), `spruce verify --dry-run` (incl. backend `?dry_run=true` on POST `/api/types/types/verify/` via `transaction.atomic()` + sentinel-rollback). Live-smoke harness now auto-discovers model id via `models list`; verify smoke runs as `--dry-run` (no DB writes). 4 backend tests + 10 CLI tests | `ba169c7` | shipped, all green |
| T — Backend dry_run expansion | `?dry_run=true` added to `PATCH /api/projects/scopes/{id}/` + `POST /api/automation/webhook-subscriptions/`. Capabilities lists (both root `/api/capabilities/` at `backend/config/views.py:33` AND embed mirror at `backend/apps/embed/views.py:158`) backfilled with the 5 existing dry_run-supporters + 2 new ones. 9 new tests | `65b40d1` | shipped, all green |
| (union fix) | Coordinator-level commit: add `'POST /api/types/types/verify/'` to root `/api/capabilities/` list (Track S only touched the embed mirror; Track T was instructed not to anticipate verify) | `f917c95` | shipped, all green |
| U — Frontend ViewerTile | Extended `IsolationConfig` with optional `renderMode: 'isolate' \| 'highlight'` + `accentColor` (default `#3b82f6`); branched `UnifiedBIMViewer` isolation effect to call `m.v3Model.highlight(matchingIds, {color, opacity:1, transparent:false, renderedFaces:0, customId:'embed-highlight'})` in highlight mode, with v2-fragments fallback + one-time warn. New `frontend/src/components/embed/ViewerTile.tsx` (218 lines, not mounted in any route yet) | `cd4249b` | shipped, all green |
| V — Docs | `docs/todos/current.md` `### Embed surface` replaced with PR-by-PR checkbox list (4 shipped, 7 pending including PR 7a sub-item); new `.claude/worktrees/README.md` cleanup recipe (`git worktree remove` + `gio trash` per global rule, never plain `rm`) | `c2b4a7f` | shipped, all green |

## Track details

### Track S — `cli+backend: add 'spruce models list' + verify --dry-run (agent-first)`

- NEW `cli/spruce/models.py` mirroring `cli/spruce/embed.py` and
  `cli/spruce/verify.py` (Typer + Rich + httpx). Subcommand
  `spruce models list` outputs a Rich table by default; `--json`
  emits raw JSON; `--project-id <uuid>` filter wired.
- EDIT `cli/spruce/cli.py` to register `models_app`.
- EDIT `cli/spruce/verify.py` to add `--dry-run/-n` Typer option;
  appends `dry_run=true` query param to the POST and renders a banner
  in human mode ("(dry run — no changes persisted)").
- EDIT `backend/apps/entities/views/types.py:286` `@action verify`
  to honor `?dry_run=true`. Implementation uses `transaction.atomic()`
  + `_DryRunCommit` sentinel rather than `savepoint()` because Django
  settings have no `ATOMIC_REQUESTS`, so a savepoint would fail
  outside a wrapping transaction. The sentinel pattern is the
  Django-recommended clean-rollback idiom. Response shape is
  identical regardless of mode; `'dry_run': true` echoed in the
  payload.
- EDIT `backend/apps/embed/views.py:158` `mutations_supporting_dry_run`
  to include the verify entry (this was the conflict point with
  Track T — see § Coordinator approach).
- NEW backend test `tests/unit/test_types_verify_dry_run.py` (4
  cases): write-by-default; `dry_run=true` writes nothing; truthy-
  string parsing; explicit `dry_run=false` persists.
- NEW CLI test `cli/tests/test_models_cli.py` (6 cases): table mode;
  `--json`; `--project-id` filter; empty payload; no-auth-header;
  HTTP 500 JSON surfacing.
- EDIT CLI test `cli/tests/test_verify_cli.py` (+4 cases): `--dry-run`
  sets query; `-n` short flag; human banner; default-off omits query.
- EDIT `cli/tests/integration/test_smoke_live.py` so
  `_require_model_id` falls back to `spruce models list --json` when
  `SPRUCE_LIVE_MODEL_ID` is unset. Verify-smoke now uses `--dry-run`
  and asserts `dry_run: true` (safer; no DB writes).
- EDIT `cli/README.md` "Live API smoke" section: `SPRUCE_LIVE_MODEL_ID`
  reclassified as optional; notes dry-run safety.

### Track T — `backend: expand ?dry_run=true (ProjectScope + WebhookSubscription) + backfill /api/capabilities/`

- EDIT `backend/apps/projects/views.py`: override `update()` +
  `partial_update()` on `ProjectScopeViewSet` with a shared
  `_dry_run_update()` helper. Reuses `_bool_param` from
  `apps/entities/views/claims.py`. Module logger added so dry-run
  paths log to the same structured channel as persisted paths.
- EDIT `backend/apps/automation/views.py`: override `create()` on
  `WebhookSubscriptionViewSet`. HMAC secret deliberately NOT
  previewed in dry-run mode — one-shot at persist time only, with
  a `note` field in the response explaining that.
- EDIT `backend/apps/embed/views.py:158`: replace the empty
  `mutations_supporting_dry_run: []` with a 7-entry list
  (alphabetized within each app group).
- EDIT `backend/config/views.py`: append the two new entries to the
  root `/api/capabilities/` manifest.
- NEW `tests/unit/test_project_scope_dry_run.py` (4 cases):
  `partial_update` dry-run preview / default persist / 400 on
  invalid input / `dry_run=false` string persists.
- NEW `tests/unit/test_webhook_subscription_dry_run.py` (3 cases):
  create dry-run preview / default persist returns secret / 400 on
  invalid input.
- EDIT `tests/unit/test_capabilities.py` (+1 case): non-empty list
  contains known entries.
- EDIT `tests/unit/test_embed_resolver.py` (+1 case): embed manifest
  mirrors root manifest.

**Pick rationale**: WebhookSubscription was picked over SavedFilter
(simpler but lower-impact) because subscriptions are already
advertised on the public capabilities manifest as an agent surface —
plan-then-execute closes a documented loop rather than opening a new
one.

**Forward-compatibility note**: `ProjectScopeSerializer` does NOT
currently expose `canonical_floors` as a writable field — only
`storey_merge_tolerance_m` is editable via PATCH. `canonical_floors`
continues to be owned by the claim-promotion service path. The
dry-run override is forward-compatible: if `canonical_floors` gets
added to the serializer later, the preview path picks it up
automatically.

### (Union fix) — `backend: add verify to root /api/capabilities/ dry_run list (Round 5 union)`

Track S extended only the embed mirror at
`backend/apps/embed/views.py:158`; Track T was instructed not to
include verify in its own list to avoid pre-empting Track S. When the
two lists got combined at cherry-pick, the embed mirror had 8 entries
but the root manifest at `backend/config/views.py:33` had only 7.
This one-line union commit (`f917c95`) keeps the two lists in sync.

### Track U — `frontend: embed PR 5 ViewerTile scaffolding (renderMode: highlight)`

- EDIT `frontend/src/components/features/viewer/UnifiedBIMViewer.tsx`:
  - Extended `IsolationConfig` (existing type, lines 99-113) with
    optional `renderMode: 'isolate' | 'highlight'` and `accentColor`.
    Default behavior preserved — undefined or `'isolate'` runs the
    current per-element `setVisible` path.
  - Added `HIGHLIGHT_ACCENT_DEFAULT = '#3b82f6'` (Tailwind blue-500).
  - Added two refs (`lastRenderModeRef`, `v2HighlightWarnedRef`).
  - Branched the isolation effect: in highlight mode, calls
    `m.v3Model.getLocalIdsByGuids(guids)` per v3 model, drops prior
    `resetHighlight()`, then
    `m.v3Model.highlight(matching, {color, opacity:1, transparent:false, renderedFaces:0, customId:'embed-highlight'})`,
    with `v3FragmentsRef.current.update()` once all settle. v2 models
    in the same group log a one-time warn and fall back to the
    existing `hider.set` path. Cross-mode transitions clean up the
    prior strategy.
- NEW `frontend/src/components/embed/ViewerTile.tsx` (218 lines).
  Pure consumer: takes `projectId`, `modelId`, `filterContext`
  (embed `FilterContext` shape from `@/lib/embed/types`), `apiClient`
  (embed-scoped axios), optional `accentColor`. React-Query against
  `/embed/instances/` with the filter context in the key. Wraps
  `<UnifiedBIMViewer>` in `<ErrorBoundary>` with an i18n fallback.
  Not mounted in any route.
- EDIT `frontend/src/i18n/locales/en.json`, `nb.json`: added
  `embed.viewerTile.unavailable` (en: "Viewer unavailable",
  nb: "Visning utilgjengelig" — proper Norwegian, no æøå
  substitution).

**v2/v3 detection path**: existed already.
`LoadedModel.formatVersion: 'v2' | 'v3'` is stamped at load time
(per memory `frontend-fragmentsmodels-v3.md`) and used throughout
fit-to-view, raycast, and type-visibility. Track U reused the field
directly — no new wiring required.

**Honest scope-cut surfaced by Track U** (logged for coordinator):
The spike doc and task brief both assumed `/api/embed/instances/`
returns GUIDs. The actual PR 3 endpoint
(`backend/apps/embed/views.py:153`) deliberately omits instance ids
and returns `type_ids[] + instance_count` only. So `ViewerTile`'s
`isolation` prop is left `null` today with a `TODO(PR 6)` referencing
the resolver extension needed. Viewer-side `renderMode: 'highlight'`
+ `accentColor` plumbing is fully wired; PR 6 only needs to populate
the GUID array. **Decision pending**: extend `/api/embed/instances/`
to surface GUIDs, OR switch ViewerTile to a type_id → GUID hop via
existing types endpoints. Product decision, not just plumbing.

### Track V — `docs: surface embed roadmap PR-by-PR into TODOs + worktree cleanup recipe`

- EDIT `docs/todos/current.md`: replaced two-bullet `### Embed surface`
  section with 4 shipped + 7 pending checkboxes (PR 1-4, PR 5, 6, 7,
  7a, 8, 9, 10). Roadmap source pointer retained.
- NEW `.claude/worktrees/README.md` (~30 lines): cleanup recipe
  (`git worktree remove` + `git worktree prune`), explicit ban on
  `rm -rf` (use `gio trash` per global rule), no-auto-cleanup note.

## Verification (end-to-end, pre-push)

| Surface | Status |
|---------|--------|
| CLI tests (`cd cli && python -m pytest tests/`) | 29/29 passed + 4 skipped (live), 0.75s |
| Backend unit tests (`./tools/python -m pytest tests/unit`) | 297/297 passed, 23.70s (baseline 284 + Track S 4 + Track T 9 = 297) |
| Frontend `tsc --noEmit` | clean |
| Frontend `yarn build` | clean (pre-existing UnifiedBIMViewer 4.7 MB chunk warning only — no new warnings) |

## Verification (post-push, all on `c2b4a7f`)

| Signal | Status |
|--------|--------|
| GitHub check-run "Supabase Preview" | success |
| GitHub check-run "Backend unit tests" | success |
| GitHub check-run "Frontend type check" | success |
| Commit-status `Vercel` | success |
| Commit-status `resilient-hope - Django` | success |
| Commit-status `resilient-hope - Fast API` | success |

All six signals green on `c2b4a7f`. Per
`feedback-verify-deploys-after-push`. No fixes needed.

## Coordinator approach

Same Rounds 3+4 cadence — kept the wins, didn't experiment:

- **Worktree isolation** — all four tracks ran in
  `.claude/worktrees/agent-*` branches. Round 4's 4/4 streak holds:
  Round 5 = 4/4 isolated. No fall-through to main. Round 3's Track N
  oddity remains a one-off.
- **Cherry-pick + batched push** — 4 track commits + 1 union-fix
  commit = 5 cherry-picks total. Single deploy cycle, single status
  poll. Safe because Track S/T overlap on `mutations_supporting_dry_run`
  was anticipated and the resolution path was scripted (union the
  lists, alphabetize verify into Track T's `/api/types/` group, add
  verify to root manifest as a follow-up commit).
- **Single anticipated conflict** — the cherry-pick of Track T over
  Track S's earlier commit conflicted on
  `backend/apps/embed/views.py:158` as expected. Resolved by union,
  inserting `'POST /api/types/types/verify/'` alphabetically into
  Track T's list. Then a one-line follow-up commit (`f917c95`) added
  the same entry to the root `/api/capabilities/` at
  `backend/config/views.py:33` so both lists stay in sync.
- **Verification battery** — same four parallel surfaces as Round
  3+4: CLI mocked tests, backend pytest, frontend tsc, frontend
  build. All green pre-push.
- **Auto-mode active** — picked tracks myself per Round 4's
  open-follow-ups, didn't pre-ask. User course-correction window was
  the launch text; no corrections came.
- **Symlink note** — `/home/edkjo/dev/sidehustles/sprucelab` is a
  symlink to `/home/edkjo/workspace/sidehustles/sprucelab`. Same
  repo. Caused one `pwd` confusion mid-verification (test files
  appeared "missing" until the symlink was recognized). Harmless.

## Open follow-ups for next round

1. **Phase 3 — Type page v2** remains the next big anchor PR. Still
   a dedicated session, NOT a parallel coordinator track.
2. **Embed PR 6 — ViewerTile wiring decision.** Track U's scaffold
   is dark today because `/api/embed/instances/` returns
   `type_ids + instance_count` only, not GUIDs. Two paths:
   - **6a**: Extend the embed resolver to surface GUIDs (cleaner;
     requires backend change to `apps/embed/views.py:153`).
   - **6b**: Add a type_id → GUID hop in ViewerTile using the
     existing types endpoints (no backend change; extra round-trip
     per filter change).
   Product decision, not just plumbing. Discuss before PR 6 starts.
3. **`DashboardFilterProvider` + `useFilterContext`** — Track U
   confirmed these don't exist yet despite being cited in the spike
   doc. EmbedDashboard keeps filter state in local React state. PR 6
   should land the provider before wiring ViewerTile into the embed
   shell.
4. **Three real-model spike items** still gate PR 5 ViewerTile from
   being mounted: ghost-mesh transparency artifacts on stacked
   walls, `model.highlight()` apply-time at ~1500 matching / ~5k
   visible (one-frame budget), multi-model coordination via
   `FragmentsModels.update()`. Omarchy session.
5. **Cross-project create restriction on Drawing/Document/TitleBlock**
   pinned with a test note since Round 4 Track P. Flips when Phase 7
   org model lands. Same trigger as `apps/filters/views.py` cleanup.
6. **`_bool_param` helper now imported across three call sites**
   (claims.py, projects/views.py, automation/views.py). If it moves
   to a shared utils module, three updates needed. Not urgent.
7. **Stale worktree branches** — Round 4 left 12+; Round 5 adds 4
   more. Cleanup recipe shipped in Track V (`.claude/worktrees/README.md`).
   Human runs it when count gets uncomfortable. Coordinator does
   NOT auto-clean.

## Notes

- Trunk-based: 5 commits direct to `main` (4 cherry-picks + 1 union
  fix). No PRs. Per memory `feedback-trunk-based-until-go-live`.
- Per `feedback-frontend-no-unit-tests`: frontend verification
  remains `tsc --noEmit` + `yarn build` + Vercel commit-status. No
  vitest. Backend pytest fully covered (297 tests).
- Per `feedback-verify-deploys-after-push`: post-push status poll
  via `gh api` until-loop. Awaiting results inline.
- Files touched: 21 across the 5 commits (1 CLI + 5 backend + 4
  frontend + 2 docs + 9 test files = 21 if I count the deletion-
  free way, or count the additions in 5 commits = 11 + 8 + 1 + 4 +
  2 = 26 file-diff entries).
- Round 4 Track P pattern reused by Track T (IsApprovedUser
  permission gating reference) is unchanged — Track T just added
  dry-run, didn't touch permissions. Same call sites would need
  the Phase 7 flip together.
