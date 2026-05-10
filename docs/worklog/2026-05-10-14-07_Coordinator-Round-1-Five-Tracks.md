# Session: Coordinator Round 1 — five parallel tracks landed

## Summary
User asked me to act as project coordinator: review the past 3 days of
worklogs, section the next batch of work into parallelizable tracks,
and delegate to other agents working in isolated worktrees so they
wouldn't interfere with each other's code or dependencies. Coordinator
plan: `~/.claude/plans/where-are-we-on-zany-dahl.md`. After plan
approval (auto mode active) I fired five agents in parallel:

| Track | Scope | Result |
|-------|-------|--------|
| A — PR 1.4 | SavedFilter backend (`apps/filters/`, 6 models, DRF, 18 tests) | shipped `95c4b50` |
| B — Phase 2 | Drawings + Documents wiring + ClaimInbox rehoused; +`dxf-viewer`, +`react-pdf` | shipped `35ed867` |
| C — ops | Sweep-on-read timeout recovery for stuck `fragments_status` (10m default) + ifc-service crash triage | shipped `04d61dd` |
| D — PR 1.3b | `ModelWorkspace.tsx` onto `useProjectFilter` (drill demote + cross-filter primary) | shipped `0cf9e83` |
| E — embed | Triage of `feat/embed-scoped-tokens-iframe` branch — read-only | reported (no commit) |

Five commits landed direct to `main` per trunk-based rule, in serialized
push order A → C → B → D, each verified individually. A late
fix-forward push `ae397a9` (vite config) was needed after Track B broke
the Vercel build.

## What each track touched

### Track A — `backend: PR 1.4 — SavedFilter primitive (apps/filters)`
- NEW Django app `backend/apps/filters/` with `SavedFilter`,
  `FilterLibrary`, `FilterLibraryEntry`, `FilterLibrarySubscription`,
  `PinnedFilter`, `FilterAnnouncement`,
  `FilterAnnouncementAcknowledgement`. CheckConstraints enforce
  exactly-one-owner per scope. UniqueConstraints on pin
  `(user, saved_filter)` and ack `(announcement, user)`.
- ViewSets at `/api/filters/{saved,libraries,pinned,announcements}/`
  with scope-aware queryset filtering. Library has `mark_seen`
  custom action; Announcement has `acknowledge`.
- 18 unit tests in `tests/unit/test_saved_filters.py` covering CRUD
  per scope, cross-user isolation, staff gates, CheckConstraint
  negatives, pin + ack idempotence.
- Wired into `INSTALLED_APPS` + URL conf. Migration `0001_initial`.

**Two TODOs** (not blockers; documented in agent report):
1. `accounts.Company` model doesn't exist yet — `owner_company` is a
   `CharField(max_length=255)` placeholder. Swap to FK once Phase 7
   org-model lands.
2. No company-admin / scope-lead role types exist yet — gates fall
   back to `is_staff` for both. TODO comments left in `views.py`.

### Track C — `backend: sweep-on-read timeout recovery for stuck fragments_status (10m default)`
- `backend/apps/models/views.py::fragments_status` action now flips
  `'generating'` → `'failed'` if the model's `updated_at` is older
  than `settings.FRAGMENTS_GENERATION_TIMEOUT` (default
  `timedelta(minutes=10)`, env-overridable via
  `FRAGMENTS_GENERATION_TIMEOUT_MINUTES`).
- 2 new tests in `tests/unit/test_fragments_status_sweep.py` — full
  unit suite stayed green (249 passed).
- The `?force=true` manual escape (added in `b92deb1`) is unchanged.

**Investigation finding** (no code change this PR): top-ranked silent
failure for the Railway ifc-service is OOM during conversion —
`convert-to-fragments.mjs` reads the IFC + decoded geometry into V8
heap simultaneously, and a SIGKILL leaves `result.stderr` empty so
the current `Conversion failed: ` reason is useless. Recommended
follow-up: a small ifc-service patch that distinguishes
`returncode == -9 / 137` and emits a structured failure log line.
Filed as a follow-up; not bundled here (different deploy target).

### Track B — `frontend: Phase 2 — Drawings + Documents wiring + ClaimInbox rehoused`
- NEW hook `frontend/src/hooks/use-drawings.ts` (mirrors
  `use-documents.ts` shape).
- Rewrote `ProjectDrawings.tsx` (was "Coming Soon") with real
  drag-drop upload + Pack-don't-stretch card grid + register-status
  pill.
- Rewrote `ProjectDocuments.tsx` with format-aware cards + claim
  lineage badge.
- NEW `ProjectClaimsPage.tsx` at route `/projects/:id/claims` —
  ClaimInbox moved out of `/documents`.
- NEW `DrawingDetail.tsx` + `DocumentDetail.tsx` + `PdfPane.tsx`
  components (all React.lazy → separate async chunks).
- npm deps added: `dxf-viewer@^1.0.47`, `react-pdf@^10.4.1`.
- i18n keys added to `en.json` + `nb.json` (proper æøå).

**Spec deviation (intentional)**: agent discovered the backend
`register` endpoint accepts `{ref1, ref2, grid_source_run}` (each ref
carries `paper_x/paper_y/grid_u/grid_v`), not the simpler
`{source_x,source_y,target_x,target_y}` the roadmap mentioned. Used
the real backend shape.

### Track D — `frontend: PR 1.3b — ModelWorkspace.tsx onto useProjectFilter (drill demote + cross-filter primary)`
- Single-file refactor (`frontend/src/pages/ModelWorkspace.tsx`,
  +306 / -123). Removed `viewerStoreyFilter` / `viewerTypeVisibility`
  local `useState`; derived from `useProjectFilter` instead. Cross-
  filter handlers wired to `setFloorCode` + `setIfcClass`. Charts
  wrapped in `<DrillTarget>` for primary-click cross-filter; modal
  demoted to `Table2` icon in card headers (mirrors PR 1.3's
  ProjectDashboard pattern).
- Treemap + GeometryBar segments hand-rolled the DrillTarget role/
  keyboard affordances because `<DrillTarget>` doesn't accept inline
  `style` (needed for absolute positioning + width %). Flagged as
  follow-up: extending `DrillTarget` with a `style?:` prop would
  consolidate.

### Track E — embed PR 4 triage (read-only)
**Finding**: branch `feat/embed-scoped-tokens-iframe` was already
squash-merged into `main` on 2026-05-05 as `fc16b1a` via PR #6 the
same evening the memory was written. The "uncommitted" memory note
was stale by ~6 hours.

Local working copies (`/home/edkjo/workspace/sidehustles/sprucelab`
and `/home/edkjo/dev/sidehustles/sprucelab`) are clean, on `main`,
no uncommitted PR-4-shaped changes anywhere.

The only file that has moved on `main` since the squash-merge is
`frontend/src/lib/embed/types.ts` — extended additively by Phase 1
PRs 1.1 and 1.2 with new filter dimensions.

**Recommendation**: shelve / delete the dead branch on origin. Not
acted on — destructive remote-branch deletion needs explicit user
confirmation (see "Open for user" below).

### Late fix-forward — `frontend: vite config — alias opentype.js to CJS + commonjs interop for dxf-viewer`
- Track B's local build (Yarn 4 PnP) was clean; Vercel's build
  (Yarn 1) was not. Yarn 1's flat hoist resolved
  `opentype.js@1.3.4`'s `.mjs` build, which only has named exports;
  `dxf-viewer/src/DxfWorker.js` does `import opentype from "opentype.js"`,
  so Rollup failed.
- `frontend/vite.config.ts` now aliases `opentype.js` →
  `opentype.js/dist/opentype.js` (CJS entry) + sets
  `optimizeDeps.include` for both packages and
  `build.commonjsOptions.transformMixedEsModules: true`. Works
  identically under Yarn 1 + Yarn 4.

## Verification

| Surface | Status |
|---------|--------|
| Backend unit tests | 249 → 265 → 265 passing across cherry-picks |
| Frontend `tsc --noEmit` | clean |
| `yarn build` | clean (only pre-existing UnifiedBIMViewer chunk-size warning) |
| Railway Django healthcheck | 200 throughout |
| Railway FastAPI | success (commit-status check) |
| Vercel | red after `0cf9e83`, green after `ae397a9` |

GitHub commit statuses on the final commit `ae397a9`:
- `resilient-hope - Django`: success
- `resilient-hope - Fast API`: success
- `Vercel`: success

## Coordinator approach (what worked)

- **Worktree isolation per track** (`isolation: "worktree"` on the
  Agent tool): each agent edited + built + committed in its own
  detached `.claude/worktrees/agent-<id>/` checkout. Zero edit
  collision; the only shared file (`backend/config/settings.py`,
  touched by both A and C) auto-merged on cherry-pick.
- **Serialized cherry-pick + push** instead of letting agents push
  directly: I cherry-picked each commit onto main, ran the relevant
  verification (`pytest` for backend, `yarn install + tsc + build`
  for frontend), then `git push origin main` and waited for the
  deploy healthcheck. Trunk-based rule + verify-deploys-after-push
  rule preserved.
- **AskUserQuestion before launching agents**: locked the four
  decisions (SavedFilter perms, Track D timing, embed direction,
  Track C shape) up-front so no agent had to make ambiguous calls
  mid-flight.

## What didn't work (lessons)

- **My local `yarn build` lied**. Yarn 4 PnP transparently fixed
  the CJS/ESM interop that Vercel's Yarn 1 couldn't. The agent's
  build also passed for the same reason. I should have either
  pushed Track B alone (smaller blast radius) and watched Vercel
  before chaining Track D, OR run a Yarn-1-equivalent build
  locally (`yarn install --frozen-lockfile` in a clean tmp dir
  with Yarn 1) before push.
- **Vercel doesn't honor `packageManager: yarn@4.12.0` in the
  frontend `package.json`** even though Corepack is the documented
  path. The CI workflow uses Corepack; Vercel doesn't. Worth a
  follow-up: either pin Vercel's install command to `corepack enable
  && yarn install --immutable`, or accept the divergence and write
  Vite config that's portable to both.

## Next

1. **Track F — PR 1.5 `<SavedFiltersDropdown>` + `useSavedFilters`
   hook.** Now unblocked (Track A merged). First consumer = federated
   viewer chips bar.
2. **ifc-service silent-failure logging.** Track C's investigation
   recommended distinguishing exit code -9 / 137 + structured failure
   log lines in `backend/ifc-service/api/fragments.py`. Small
   follow-up; different deploy target than the Track C Django patch.
3. **Replace `is_staff` fallbacks in `apps/filters/`** when Phase 7
   org model + company-admin role land. TODOs are in place.
4. **Vite ↔ Vercel package-manager mismatch** — decide between
   pinning Vercel to Yarn 4 via Corepack vs keeping the portable
   Vite config we just landed.

## Open for user

- **Embed branch deletion.** Track E recommends deleting
  `origin/feat/embed-scoped-tokens-iframe` (already squash-merged
  on 2026-05-05). I did not act — branch deletion on origin is a
  destructive remote-side op. If you're happy with the recommendation,
  the cleanup is `git push origin --delete feat/embed-scoped-tokens-iframe`.

## Notes

- Trunk-based: 5 commits direct to `main` (4 track cherry-picks + 1
  fix-forward). No PRs.
- Plan file (consumed by ExitPlanMode this session):
  `~/.claude/plans/where-are-we-on-zany-dahl.md`.
- Per `feedback-frontend-no-unit-tests.md`: verification is
  `tsc --noEmit` + `yarn build` + commit-status checks for Vercel
  + Railway healthcheck.
- Per `feedback-verify-deploys-after-push.md`: every push hit a
  Railway 200 + Vercel commit-status check before the next push.
  The Vercel red was caught by the same gate.
