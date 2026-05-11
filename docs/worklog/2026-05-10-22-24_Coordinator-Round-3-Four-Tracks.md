# Session: Coordinator Round 3 — four parallel tracks landed

## Summary

User asked the coordinator (me) to plan and launch parallel work
sessions, then guide to worklog + push + verification (incl. unit
tests). Same worktree-isolation pattern as Rounds 1 and 2. Picked four
non-overlapping tracks from the open-follow-ups list in
`2026-05-10-21-54_Coordinator-Round-2-Five-Tracks.md` plus the
"stale-since-2026-04-24" `docs/todos/current.md` flag.

Four agents, four cherry-picks serialized onto `main` (one fell
through to main directly — see Track N note), one batched push, all
six GitHub check-runs + commit-statuses green.

| Track | Scope | Commit | Status |
|-------|-------|--------|--------|
| K — TODO refresh | Rewrite `docs/todos/current.md` to reflect actual state post Rounds 1+2 (move shipped → "Recently shipped", surface real backlog) | `fd1249f` | shipped, all green |
| L — DrillTarget `title?:` | Add `title?: string` prop, restore native hover tooltips on ModelWorkspace treemap rectangles + GeometryBar segments (Round 2 follow-up) | `20299dd` | shipped, all green |
| M — CLI tests | Mocked-HTTP tests (respx) for `spruce {types,verify,scripts}` — 19 tests cover URL/header/payload/JSON shapes without needing a live server | `47b2f6e` | shipped, all green |
| N — Embed PR 5+ roadmap | Surface 7 PR-5+ candidates into `docs/plans/2026-05-10-22-16_Embed-Roadmap-PR5-Plus.md`, anchored on the existing `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md` master plan | `3ff2324` | shipped, all green |

## Track details

### Track K — `docs: refresh current TODO backlog after Round 2`
- EDIT `docs/todos/current.md` — 70 insertions / 98 deletions, net 103
  lines (well under the 200-line cap).
- "Recently shipped" section now anchors Webhook System (`b73a1d5`,
  2026-04-29) and CLI Expansion (`991cce9`, 2026-05-10) plus the rest
  of Rounds 1+2: PR 1.3, 1.3b, 1.4, 1.5, Phase 2 Drawings/Documents,
  ifc-service OOM detection, Django fragments sweep, Vercel Corepack
  pin, F-1/F-2/F-3 floors, Embed PRs 1-4.
- "Active backlog" now anchors on Phase 3 Type page v2 (next anchor
  PR), live-API CLI smoke, embed PR 5+ discovery, filter-system
  follow-ups.
- "Parked/deferred" lists viewer perf and Sprint 6.3 LLM extraction
  per memory.

### Track L — `frontend: DrillTarget title?: prop + restore native hover tooltips`
- EDIT `frontend/src/components/filters/DrillTarget.tsx` — added
  `title?: string` to the prop interface alongside `className?:` and
  `style?:`. Threaded through `createElement` via conditional spread
  (`...(title !== undefined ? { title } : {})`) so the DOM attribute
  is only set when defined.
- EDIT `frontend/src/pages/ModelWorkspace.tsx` — added `title=` to the
  two consumer sites that lost native tooltips in Round 2's Track H:
  - Treemap rectangle (~L961): `title={`${r.label}: ${r.value.toLocaleString()}`}`
  - GeometryBar segment (~L1015): `title={`${label}: ${value.toLocaleString()} (${pct.toFixed(1)}%)`}`
  `ariaLabel` preserved on both (screen-reader audience vs. hover
  audience — both served now).
- Verification: `yarn tsc --noEmit` clean, `yarn build` clean (only
  pre-existing UnifiedBIMViewer chunk-size warning, as expected).

**Caveat**: Legend swatches in GeometryBar were intentionally left
without `title=` — they already display the label+value visibly, so a
redundant tooltip would be noise.

### Track M — `cli: add CLI subcommand tests with mocked HTTP`
- NEW `cli/pytest.ini` — CLI-local pytest config so tests don't
  inherit the repo's `DJANGO_SETTINGS_MODULE`.
- NEW `cli/tests/__init__.py`, `cli/tests/conftest.py` — shared
  `runner` fixture (Typer CliRunner) + autouse `_pin_api_url`
  (monkeypatches `get_api_url` in `spruce.{config,types,verify,scripts}`)
  + autouse `_clear_admin_token` + opt-in `admin_token_env` fixture.
- NEW `cli/tests/test_types_cli.py` (10 tests), `test_verify_cli.py`
  (3 tests), `test_scripts_cli.py` (6 tests). 19 total, 0.70s runtime.
- EDIT `cli/pyproject.toml` — added `respx>=0.20.0` as dev dep (one
  new dep, smaller surface than `pytest-httpx`).
- Coverage: every endpoint URL, header injection (Bearer from env or
  omitted when no token), payload shape, `--dry-run` query-param
  toggle, `--json` output shape, exit codes 0/2 for arg-validation
  failures, HTTP-error JSON output paths.
- Confirms the Round 2 worklog's "POST not GET for verify"
  deviation via `test_verify_posts_to_verify_endpoint`.

**Discrepancies found**: None. Every endpoint, payload shape, and
exit code in the implementation matched what the Round 2 worklog
described. Live API smoke is still deferred (needs a running server)
but the deterministic-path coverage is now automated.

### Track N — `docs: surface embed PR 5+ roadmap for next embed work session`
- NEW `docs/plans/2026-05-10-22-16_Embed-Roadmap-PR5-Plus.md` (126
  lines). Spine: existing `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md`
  (the master 10-PR sequence + robustness contract + open questions),
  rounded out with worklog evidence for PRs 1-4 and the three relevant
  memory entries (`forward-deployed-embed-mission`,
  `speckle-powerbi-robustness-lesson`, `single-project-filter-store-bidirectional`).
- Sections: Mission recap / PRs 1-4 shipped (commit-anchored) / PR 5+
  candidates (7 of them: ViewerTile, TypeBrowser+cross-filter,
  robustness pass, quality dimension, Requirements Fulfillment
  dashboard, Floors Overview dashboard, skiplum-pages integration) /
  Open questions / Anti-goals (lifted from
  `feedback-keep-layouts-simple` + the speckle-powerbi lesson).
- Findings: master embed plan was already in the repo; missing piece
  was the synthesized "what's next" view. The highlight-mode spike
  tagged for omarchy in 2026-05-04's Q-pass appears never to have
  been run — it's flagged as Open Question #1, the most concrete
  unknown blocking PR 5.

**Worktree isolation oddity**: Track N's worktree isolation
fell back to the main working directory — its commit `3ff2324` landed
directly on `main` instead of an isolated worktree branch. The commit
content was clean (single new file under `docs/plans/`) so no
intervention was needed, but the agent's reported `worktreePath:`
line was missing from the tool output. Pattern worth noting for next
round.

## Verification (end-to-end)

| Surface | Status |
|---------|--------|
| CLI tests (`cd cli && python -m pytest tests/`) | 19/19 passed, 0.70s |
| Backend unit tests (`./tools/python -m pytest tests/unit -v`) | 267/267 passed, 17.96s |
| Frontend `tsc --noEmit` on main HEAD | clean |
| Frontend `yarn build` on main HEAD | clean (pre-existing UnifiedBIMViewer chunk warning only) |
| GitHub check-run "Supabase Preview" on `47b2f6e` | success |
| GitHub check-run "Frontend type check" on `47b2f6e` | success |
| GitHub check-run "Backend unit tests" on `47b2f6e` | success |
| Commit-status `resilient-hope - Django` on `47b2f6e` | success |
| Commit-status `resilient-hope - Fast API` on `47b2f6e` | success |
| Commit-status `Vercel` on `47b2f6e` | success |

Per `feedback-verify-deploys-after-push.md`: all checks polled on the
push HEAD (`47b2f6e`) before declaring done. No fixes needed.

## Coordinator approach (what changed from Rounds 1 + 2)

- **One batched push instead of N serialized pushes.** Rounds 1 + 2
  pushed each track individually (5 separate pushes, 5 separate
  commit-status polls). Round 3 cherry-picked all four onto local
  `main` first, ran the full verification battery (CLI pytest +
  backend pytest + frontend tsc + frontend build) locally, then
  pushed once. Cheaper on Vercel/Railway minutes and a single status
  poll. Safe here because zero file overlap meant zero conflict risk
  and all four tracks were low-blast-radius (docs + non-runtime
  frontend + tests + docs).
- **Backend pytest added to the verification loop.** User
  explicitly called for unit tests in addition to build verification
  (auto-mode interrupt). 267 tests covers the whole `tests/unit`
  surface — confirms zero backend regression from the four tracks
  (none of which touched backend code, but belt-and-suspenders).
- **Skipped `AskUserQuestion` pre-launch.** Auto-mode active and user
  said "you're the coordinator in charge". Picked tracks from the
  Round 2 open-follow-ups list myself; user could have course-corrected
  during the launch text but didn't need to.

## Open follow-ups for next round

1. **Phase 3 — Type page v2** is still the next big anchor PR.
   Deserves a dedicated session, NOT a parallel track.
2. **Live API smoke for the CLI** — still deferred. Track M's mocked
   tests cover URL/header/payload deterministically; live smoke
   against the dev API is the missing-piece if/when we want it.
3. **PR 5 ViewerTile** is the most concrete next embed step. Open
   Question #1 in the new roadmap doc (highlight-mode spike status)
   is the gating unknown.
4. **Worktree isolation reliability** — Track N's worktree isolation
   didn't take. Single occurrence so far; not actionable yet, but
   worth watching across Rounds 4+.
5. **Yarn `install-state.gz` jitter** — `frontend/.yarn/install-state.gz`
   reliably shows as modified after any `yarn build`. Harmless, but
   noise. Could be gitignored; not urgent.

## Notes

- Trunk-based: 4 commits direct to `main` (3 cherry-picks + 1
  direct-to-main from Track N's isolation fallthrough). No PRs.
- Per `feedback-frontend-no-unit-tests.md`: frontend verification
  remains `tsc --noEmit` + `yarn build` + Vercel commit-status.
  No vitest. Backend pytest fully covered.
- Per `feedback-verify-deploys-after-push.md`: post-push status poll
  via `gh api` ran until all checks resolved. All green.
- Files touched: 11 (1 doc rewrite, 2 frontend, 1 new plan, 7 new CLI
  test files + 1 new pytest.ini + 1 pyproject.toml edit).
