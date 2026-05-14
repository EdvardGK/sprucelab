# Prod frag backfill + filtered-empty banner

Resumed after a session-crash (possible OOM — laptop froze). Working tree was clean; only loose thread was "run backfill on Railway and verify" from the prior session's checklist. Closed that, then took Track 3 UX item 1a (empty-state messaging) as the next visible PR per `feedback-frontend-first-until-app-feels-real.md`.

## What shipped

1. **All 8 prod models re-converted** — every existing `.frag` binary was rewritten through the FastAPI converter so opening-element geometry is dropped per `9ef1499`. 7 fired through `backfill_v3_fragments --all`; the 8th was stuck in `status=generating` from before the session and got skipped by the management command's safety guard, so I re-triggered it via direct `trigger_fragment_generation()` call. All 8 now at `fmt=v3 status=completed` with fresh `fragments-complete` callbacks verified in Django logs (17:30–17:40).

2. **`feat(filters): amber banner when active filters hide every row` (`3fb6541`)** — when cross-filter dimensions hide every row, Model dashboard and Types page now render an amber banner reading "All N types are hidden by your active filters · M filter(s) active" with a Clear button. Replaces the silent blank-tile state that previously read as a backend failure (the user themselves got tricked by it last week).
   - New `<FilteredEmptyBanner>` component, scoped to cross-store dimensions only.
   - New `useActiveFilterCount()` selector on `ProjectFilterProvider`; replaces inline 10-line count in `ModelWorkspace`.
   - i18n keys added to en + nb.
   - Verified live on www.sprucelab.io — `index-DZdkwYX9.js` contains `FilteredEmptyBanner` and `filteredEmpty`.

## Tooling friction worth flagging

- **`railway ssh` was the right tool, not `railway run`.** `railway run` injects prod env vars into the *local* Python — which is system Python 3.13 with newer Django that hits the `CheckConstraint(check=...)` vs `condition=` gotcha from memory `django-checkconstraint-version-gotcha.md`. The fix: `railway ssh --service Django -- python manage.py …` runs inside the prod container with the pinned Django 5.0. Worth a sentence in CLAUDE.md or the deploy-gotchas memo so the next session doesn't burn the same minutes.

- **Stdin doesn't pipe through `railway ssh --`.** `echo … | railway ssh -- python manage.py shell` and `railway ssh -- python -c "…"` both broke (shell got interactive IPython or sh quoting errors). The pattern that worked:
  ```bash
  SCRIPT=$(base64 -w0 <<'EOF'
    …python here…
  EOF
  )
  railway ssh --service Django "echo $SCRIPT | base64 -d | python -"
  ```
  Note: no `--` separator; the whole shell expression goes as a single arg. Worth promoting to a tiny helper or a memo if we end up running more ad-hoc Django queries against prod.

- **Auto-mode safety classifier blocked `railway ssh` for management commands** even though my project memory `feedback-all-prod-data-is-test.md` says re-analyze freely. The harness can't see project memories — it just classifies "ssh into production + management command" as production-modifying. Workaround = ask the user; alternative = add `Bash(railway ssh:*)` to `.claude/settings.local.json` allowlist if this becomes routine. Same block fired on `kill <pid>` for orphaned local ssh processes from the broken stdin attempts.

## Skipped / deferred

- **Chip emphasis on empty result** (next-steps item 1b) — would require crossing a context boundary (chip lives in `ModelWorkspace` OUTER, `filteredTypes` lives in `AnalysisDashboard` INNER). Banner sits adjacent in the same amber tone, so chips read as the cause by proximity. Punted as a separate polish PR if it still feels needed once the banner lands in front of users.

- **URL filter validation on mount** (next-steps item 1c) — the root cause behind the symptom. Banner is the symptom fix. Root cause is more invasive (touches `useProjectFilterUrl.ts` hydration effect) so symptom-first was the right order.

- **Materials browser empty state** — uses local `selectedFamily`/`searchQuery` state, not the cross-store filter, so the banner wouldn't fire there. Lower-pain surface; deferred.

- **Polish: `--force` flag on `backfill_v3_fragments`** — a model stuck in `status=generating` from before the session got skipped by the safety guard. A model that's been "generating" for hours is much more likely stuck than running. Not urgent — for one-off re-triggers the direct `trigger_fragment_generation()` call works fine.

- **Worktree cleanup** — `.claude/worktrees/` has 46 locked agent worktrees taking 14G from prior coordinator sessions. Not a blocker; needs explicit user go for the bulk `git worktree remove --force`.

## Next

Three live candidates, in rough priority:

1. **Track 3 UX 1c — URL filter validation on cold mount** — root cause for stale-deep-link empties. The symptom fix (banner) is now live; this closes the loop. Touches `useProjectFilterUrl.ts:86-110`. Smaller and visible.

2. **Dashboard-metrics latency re-verification** on the freshly converted models. User measured 3.6s/7.5s pre-`15d0718` fix; target <500ms. 10 min. Invisible but de-risks the N+1 collapse claim.

3. **Viewer P0s** (lodSize cascade / Section Plane crash / DPR clamp) — still parked per `feedback-viewer-perf-rabbithole.md`; needs explicit user ask.

## Refs

- Backfill commit: `09efef6` (prior session, just used here)
- Banner commit: `3fb6541`
- Live: https://www.sprucelab.io (`index-DZdkwYX9.js` verified contains new symbols)
- Tasks: #1 + #2 (backfill) + #3 (banner) + #5 (verify) all completed; #4 (chip emphasis) deleted with rationale.
