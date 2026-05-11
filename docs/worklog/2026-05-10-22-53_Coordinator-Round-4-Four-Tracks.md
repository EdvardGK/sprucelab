# Session: Coordinator Round 4 — four parallel tracks landed

## Summary

User asked the coordinator to plan and launch parallel work, then guide
to worklog + push + verification (the same lifecycle Round 3 settled
on). Same worktree-isolation pattern, same batched-push cadence, same
end-to-end verification battery (CLI pytest + backend pytest + frontend
tsc + frontend build + GitHub check-runs + commit-statuses).

Picked four non-overlapping tracks from the open-follow-ups list in
`2026-05-10-22-24_Coordinator-Round-3-Four-Tracks.md` plus the
`docs/todos/current.md` "Active backlog" surface. Tracks split as
infra / backend / docs / cli — zero file overlap by construction.

| Track | Scope | Commit | Status |
|-------|-------|--------|--------|
| O — Yarn install-state.gz gitignore | Untrack `frontend/.yarn/install-state.gz` + add Yarn Berry whitelist-style ignores. Resolves the "harmless but noisy" jitter flagged in Round 3 worklog § Open follow-ups | `ac5a304` | shipped, all green |
| P — PR 2.3 permissions gating | Gate `DrawingSheetViewSet`, `TitleBlockTemplateViewSet`, `DocumentContentViewSet` with `IsApprovedUser`. Mirrors `apps/filters/views.py` precedent. Adds `tests/unit/test_drawings_documents_permissions.py` (17 tests, 267 → 284) | `b301be3` | shipped, all green |
| Q — Highlight-mode spike doc | Resolve Open Question #1 in `docs/plans/2026-05-10-22-16_Embed-Roadmap-PR5-Plus.md` by surveying the installed `@thatopen/fragments` v3.0.11 highlight API surface and recommending a concrete PR 5 ViewerTile design. Doc-only deliverable: `docs/research/2026-05-10-22-37_Viewer-Highlight-Mode-Spike.md` | `cc85594` | shipped, all green |
| R — CLI live-API smoke harness | Opt-in pytest suite under `cli/tests/integration/` gated by `SPRUCE_LIVE_API_URL` env var; skipped by default. Three smoke tests: `scripts list`, `types list --model`, `verify --model`. README section + `live` marker registered | `670ad26` | shipped, all green |

## Track details

### Track O — `infra: gitignore frontend/.yarn/install-state.gz (and Yarn Berry friends)`

- EDIT `frontend/.gitignore` (+12 lines): appended Yarn Berry whitelist
  block — `.yarn/*` + negations for `cache`, `patches`, `plugins`,
  `releases`, `sdks`, `versions`. Also `.pnp.*`. Defense-in-depth
  against `build-state.yml` and `unplugged/` recurring later.
- DELETE `frontend/.yarn/install-state.gz` (1,035,583 bytes) via
  `git rm --cached` — file remains on disk (Yarn regenerates it on
  install/build), just no longer tracked.
- Surprise: root `.gitignore` already had Yarn ignore lines
  (174-179, duplicated 215-220) but they were inert because
  `install-state.gz` was already tracked. The `git rm --cached` was
  the actual fix; the new `frontend/.gitignore` block cements it.

### Track P — `backend: gate Drawing/Document/TitleBlock ViewSets by project membership (PR 2.3)`

- EDIT `backend/apps/entities/views/drawings.py` (+8 lines):
  imports + `permission_classes = [IsApprovedUser]` on
  `DrawingSheetViewSet` and `TitleBlockTemplateViewSet`.
- EDIT `backend/apps/entities/views/documents.py` (+8 lines): same on
  `DocumentContentViewSet`.
- EDIT `tests/conftest.py` (+17 lines): `_open_permissions` fixture
  extended to monkey-patch the three new gates to `AllowAny` for the
  rest of the suite (because `permission_classes` on a ViewSet
  bypasses `DEFAULT_PERMISSION_CLASSES`).
- NEW `tests/unit/test_drawings_documents_permissions.py` (+295 lines,
  17 tests). Coverage: approved user can list/retrieve/mutate;
  unapproved user (`pending`) gets 403 across all three ViewSets and
  custom actions (`/register/`, `/content/`); anonymous gets 403.
- Suite delta: 267 → 284 (17 new), zero regressions.

**Pattern choice**: mirrored `apps/filters/views.py` (which uses
`IsApprovedUser` and explicitly defers per-project membership to
Phase 7 / org-model). Did NOT introduce `IsProjectMember` because no
`Membership`/`ProjectMember` model exists yet. Cross-project create
is currently allowed and pinned with a deliberate test note for the
future Phase 7 PR to flip.

### Track Q — `docs: viewer highlight-mode spike (gates embed PR 5 ViewerTile)`

- NEW `docs/research/2026-05-10-22-37_Viewer-Highlight-Mode-Spike.md`
  (245 lines). Sections: Question / Current state / fragments v3 API
  surface / Gap analysis / Recommended PR 5 design / Open follow-ups.
- fragments v3.0.11 highlight surface (per
  `frontend/node_modules/@thatopen/fragments/dist/index.d.ts`):
  - `FragmentsModel.highlight(localIds | undefined, MaterialDefinition)`
    — apply `{color, opacity, transparent, renderedFaces, customId?}`;
    stackable per `customId`. Pair with `getHighlight`,
    `resetHighlight`, `getHighlightItemIds`.
  - Full per-element visibility surface
    (`setVisible`/`resetVisible`/`getVisible`/`getItemsByVisibility`/
    `toggleVisible`).
  - `getItemsOfCategory(category)` — already used by v3 type
    extraction.
  - No dedicated "ghost the rest" — composed via two `highlight()`
    calls with stable `customId`s.
- Top recommendation: add additive `renderMode: 'isolate' | 'highlight'`
  (+ optional `accentColor`) to the existing `IsolationConfig` on
  `UnifiedBIMViewer`. Ship a new `ViewerTile` (embed-only) that reads
  `useFilterContext()`, hits `/api/embed/instances`, pipes resolver
  output into `isolation`. v2-format models in federated groups
  degrade to filter mode (logged once). No state machine, no new
  manager class — one new effect branch + one new component.
- Three items still need an omarchy real-model spike before PR 5
  ships: ghost-mesh transparency artifacts on stacked walls,
  `model.highlight()` apply-time at ~1500 matching / ~5k visible
  (one-frame budget), multi-model coordination via
  `FragmentsModels.update()`.

**Self-flag**: The agent reported using `rm` once on a stray duplicate
copy of the doc that they had accidentally written into the main repo
path (outside the worktree) before realizing where they were. The file
was a fresh write with no user data. Per the global rule, future
strays should route through `gio trash`. Coordinator-level note: not
a blocker; canonical copy is the worktree commit.

### Track R — `cli: add opt-in live-API smoke harness for spruce subcommands`

- NEW `cli/tests/integration/__init__.py`, `cli/tests/integration/conftest.py`,
  `cli/tests/integration/test_smoke_live.py`.
- EDIT `cli/pytest.ini`: registered `live` marker so `--strict-markers`
  doesn't warn.
- EDIT `cli/README.md`: added "Live API smoke" section with env-var
  table (`SPRUCE_LIVE_API_URL`, `SPRUCELAB_ADMIN_TOKEN`,
  `SPRUCE_LIVE_MODEL_ID`) and the run command.
- Test results: `19 passed, 3 skipped in 0.34s` — mocked suite
  unchanged, three new live tests skip cleanly because
  `SPRUCE_LIVE_API_URL` isn't set in the worktree.
- Conftest override pattern: parent `_pin_api_url` autouse pins the
  API URL to a sentinel for mocked tests; integration `conftest.py`
  re-overrides it to honor `SPRUCE_LIVE_API_URL` from the env. Verified
  the override works by setting `SPRUCE_LIVE_API_URL=http://127.0.0.1:9`
  and getting a real `ConnectError` (no fake-success swallowing).

**CLI gaps surfaced** (backlog candidates):
1. No `spruce models list` exists — harness needs a pre-discovered
   model id via `SPRUCE_LIVE_MODEL_ID` env var. Per-test
   `_require_model_id()` helper emits a clear skip message.
2. `spruce verify` has no `--dry-run` flag — current callback
   (`cli/spruce/verify.py:62-70`) accepts `--model`, `--project-id`,
   `--admin-token`, `--json` only. The smoke test runs the full
   (idempotent) verification and validates the POST + JSON shape.
   Adding `--dry-run` would be cheap (engine recompute is already
   idempotent) and the test name+body just need a one-line update.

## Verification (end-to-end)

| Surface | Status |
|---------|--------|
| CLI tests (`cd cli && python -m pytest tests/`) | 19/19 passed + 3 skipped (live), 0.34s |
| Backend unit tests (`./tools/python -m pytest tests/unit -v`) | 284/284 passed, 23.93s |
| Frontend `tsc --noEmit` on main HEAD | clean |
| Frontend `yarn build` on main HEAD | clean (pre-existing UnifiedBIMViewer chunk warning only) |
| GitHub check-run "Supabase Preview" on `670ad26` | success |
| GitHub check-run "Frontend type check" on `670ad26` | success |
| GitHub check-run "Backend unit tests" on `670ad26` | success |
| Commit-status `resilient-hope - Django` on `670ad26` | success |
| Commit-status `resilient-hope - Fast API` on `670ad26` | success |
| Commit-status `Vercel` on `670ad26` | success |

Per `feedback-verify-deploys-after-push.md`: all checks polled on the
push HEAD (`670ad26`) before declaring done. No fixes needed.

## Coordinator approach

Same Round 3 cadence — kept the wins, didn't experiment:

- **Worktree isolation** — all four tracks ran in
  `.claude/worktrees/agent-*` branches. Round 3's "Track N fell
  through to main" oddity did NOT recur this round. Four for four
  on isolation.
- **Cherry-pick + batched push** — instead of 4 serialized pushes
  (and 4 separate Vercel/Railway runs), cherry-picked O→P→Q→R onto
  local `main`, ran the full verification battery locally, pushed
  once. Single deploy cycle, single status poll. Safe because zero
  file overlap between tracks.
- **Pre-cherry-pick housekeeping** — `git checkout HEAD -- frontend/.yarn/install-state.gz`
  was needed to discard the local Yarn jitter before cherry-picking
  Track O (the cherry-pick wanted to delete the file from index, but
  the working-tree version was dirty from a prior `yarn build`). Track
  O itself permanently fixes this for future rounds.
- **Verification battery** — same four parallel surfaces as Round 3:
  CLI mocked tests, backend pytest, frontend tsc, frontend build. Then
  push, then check-run + commit-status poll loop until green. Total
  pre-push verification took ~25s wall time (parallelized).
- **Auto-mode active** — picked tracks myself per Round 3's
  open-follow-ups, didn't pre-ask. User course-correction window was
  the launch text; no corrections came.

## Open follow-ups for next round

1. **Phase 3 — Type page v2** is still the next big anchor PR.
   Remains a dedicated session, NOT a parallel track.
2. **PR 5 ViewerTile is now de-gated.** Track Q's spike doc resolves
   Open Question #1 from the embed roadmap. Three real-model spike
   items still need an omarchy session before PR 5 ships, but the
   design is concrete enough to start scaffolding the component.
3. **`spruce models list` + `spruce verify --dry-run`** — Track R
   surfaced these as gaps. Both are small CLI additions; could land
   as a follow-up CLI track in Round 5.
4. **Cross-project create restriction on Drawing/Document/TitleBlock**
   is pinned with a test note. Flips when Phase 7 org model lands.
   Same trigger as `apps/filters/views.py` cleanup already in the
   backlog.
5. **Stale worktree branches** — 8 from Rounds 1-3 plus 4 fresh from
   Round 4 = 12 under `.claude/worktrees/`. Harmless; clean by hand
   when convenient. Worktree-isolation reliability now four-for-four
   in Round 4 — Round 3's single fall-through stays a one-off
   datapoint.

## Notes

- Trunk-based: 4 commits direct to `main` (4 cherry-picks). No PRs.
- Per `feedback-frontend-no-unit-tests.md`: frontend verification
  remains `tsc --noEmit` + `yarn build` + Vercel commit-status.
  No vitest. Backend pytest fully covered.
- Per `feedback-verify-deploys-after-push.md`: post-push status poll
  via `gh api` (until-loop, 30s cadence) ran until all checks
  resolved. All green.
- Files touched: 14 (1 frontend `.gitignore`, 1 deleted Yarn cache
  file, 2 backend ViewSets + 1 conftest + 1 new test module, 1 new
  research doc, 5 new CLI integration files + 1 pytest.ini + 1
  README edit).
- Round 3's worktree-isolation oddity (Track N) — did not recur.
  Round 4 = 4/4 isolated. Watching it across Rounds 5+ but no longer
  flagging as actionable.

## Post-wrap follow-ups (after the Round 4 worklog landed)

Two items came in after the worklog push (`0c519f1`) — both ran
serially against `main`, not as additional tracks.

### `257e749` — `ifc-service: profile endpoint returns 200+null for "no profile" case`

User reported a recurring `GET .../profile/{guid} 404` in the prod
console (pasted from the live viewer). Diagnosis: the FastAPI endpoint
at `backend/ifc-service/api/ifc_operations.py:217` was emitting `404`
for three semantically distinct states (file not loaded, element GUID
not found, **element exists but has no `IfcProfileDef`**). The third
is the common case for non-extruded elements (walls without extrusion
profiles). Per `feedback-bad-models-are-the-product` + CLAUDE.md
agent-first design, that's a data property, not an error.

Change: `response_model=Optional[ProfileData]` + `return None` on the
"no profile" branch. Real errors (file/element not found) still 404.
Frontend client (`frontend/src/lib/ifc-service-client.ts:262-274`)
needed no change — `response.json()` on a `200 + null` body already
yields `null`. Backend pytest unchanged at 284/284. All six
deploy/check signals green on `257e749`.

### Dashed-line LOD at distance (diagnosed, parked)

User flagged "lines get dashed when seen from afar — looks like shit"
in the viewer. Diagnosis (no code change): the dashes are fragments
v3's **LOD line representation**, not an MSAA failure. The relevant
class in `frontend/node_modules/@thatopen/fragments/dist/index.d.ts:1592-1599`
is `LodMaterial extends THREE.ShaderMaterial` with `isLineMaterial = true`
and a `LineMaterialParameters` constructor. Past a distance threshold
v3 swaps tiles to a fat-line shader; as `lodSize.xy` shrinks toward
sub-pixel, the screen-space line accumulator stippels.

Same code path as the existing `lodSize` upstream bug (already pinned
in `next-steps.md` and memory `frontend-fragmentsmodels-v3.md`).
`gq=1` (current default) only delays the LOD swap — doesn't disable
line-LOD entirely. Three fix paths considered: recolor `lodColor` to
scene tone (cheapest), substitute `LodMaterial` per model after load
(risk: v3 re-assigns on every tile refresh), cap LOD swap (no clean
knob in the v3 .d.ts surface, would need a fork). User said "skip,
just make a note" — diagnosis added as a new section in memory
`frontend-fragmentsmodels-v3.md` co-located with the existing lodSize
note. Resurface together when the upstream fix lands.
