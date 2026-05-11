# Session end — round 7 wrap + new coordinator-shape rule

## Summary

Coordinator round 7 (W/X/Y/Z, four worktree-isolated tracks) shipped
on `main` (`70b5c77..5fd3ad4`), all deploys verified green. Then the
user pushed back: *"I still don't see anything in the app."* Round 7
was four invisible-to-the-app tracks (CLI verbs, agent discovery,
CLI error helpers, backend extractor) — exactly the pattern this
morning's `feedback-coordinator-rounds-ship-invisible-work` flagged.
User's directive for next session: *"run both backend and frontend
agents."* Saved as a hard rule on coordinator-round shape.

The round itself is fully detailed in the round-7 worklog
(`docs/worklog/2026-05-11-15-12_Coordinator-Round-7-Four-Tracks.md`).
This session-end log captures only the post-shipping events.

## Changes (post round-7 worklog)

- `docs/worklog/2026-05-11-15-12_Coordinator-Round-7-Four-Tracks.md`
  — round-level worklog, committed as `5fd3ad4`, pushed to `main`.
- Six prod signals verified after Railway pickup:
  `/api/health/` (200), `/api/capabilities/` (cli_commands +
  discovery keys present), `/.well-known/agent-tools.json` (200,
  manifest correct), `/llms.txt` (200, text/plain),
  `/api/types/claims/` (403 not 500 → migration 0042 applied),
  Vercel root (200, no rebuild expected).
- New memory:
  `~/.claude/projects/-home-edkjo-workspace-sidehustles-sprucelab/memory/feedback-coordinator-rounds-must-include-frontend.md`
  — coordinator rounds must brief at least one frontend agent; if
  none ready, drop to single-track instead.
- `MEMORY.md` index updated with the new feedback entry.
- `next-steps.md` rewritten to lead with the new directive and a
  proposed 3-track shape for next session (1 backend backfill +
  1 backend follow-up + 1 frontend, frontend choice listed).

## Technical Details

The cherry-pick integration of round 7 produced one conflict in
`backend/config/views.py` between Track W's `cli_commands` block
and Track X's `discovery` block (both additions inside the
`capabilities()` Response dict). Resolved by keeping both,
alphabetical within block boundaries.

Track Y's CLI helper adoption auto-merged with Track W's new
`files.py` cleanly because W shipped its own `_handle_http` (the
established pattern at briefing time). Small follow-up filed for
next session: fold W's `files.py` to use Y's `_errors.py` helper.

The deploy verification used a single `ScheduleWakeup` (270s) to
stay inside the prompt-cache TTL window rather than chaining short
sleeps. One wakeup, all six signals confirmed green.

## Why round 7 still went invisible despite morning's feedback

Diagnosed in `feedback-coordinator-rounds-must-include-frontend`:
agent-surface plumbing parallelizes naturally (separate files, no
UI conflicts). Frontend tracks touch hot files (routes, sidebars,
main pages) and feel harder to fit into a parallel briefing. Default
shape of "4-track coordinator round" therefore biases toward four
backend tracks. The new rule forces that bias the other way:
coordinator rounds without a frontend agent are not the default
shape anymore.

## Next

1. **First action next session:** read the new directive at the top
   of `next-steps.md` — coordinator rounds MUST include a frontend
   agent.
2. Proposed 3-track shape (in `next-steps.md`):
   - Backend: observation→claim backfill management command +
     prod run (surfaces Track Z's value over existing 1,646 text
     blocks → Claim Inbox suddenly populated).
   - Backend: `spruce files` → `_errors.py` adoption follow-up.
   - Frontend (non-negotiable): pick one of —
     `TypeDetailPanel` Observations placeholder → real list, OR
     surface observation-derived claims in `ClaimInbox`, OR start
     Phase 3 Type page v2.
3. If no frontend track is briefable, do NOT run a coordinator round
   — drop to single-track per the new memory.

## Notes

- 20+ stale agent-worktree branches accumulated across rounds 1–7.
  Cleanup recipe lives in `.claude/worktrees/README.md`. Not
  blocking; clean when the count gets uncomfortable.
- The round-7 backfill plan (option A, observation→claim over
  existing 1,646 text blocks) is queued but NOT shipped — needs the
  next session's prod-run authorization.
- Symlink quirk persists: `/home/edkjo/dev/sidehustles/sprucelab` →
  `/home/edkjo/workspace/sidehustles/sprucelab`. Same repo. Doesn't
  hurt anything, but keep it in mind if `pwd` looks unfamiliar.
- Session totals: 4 code commits + 1 doc commit on `main`, backend
  unit tests 337 → 376 (+39), CLI tests 63 → 118 (+55), 6/6 prod
  signals green, 2 memory files written, 2 worklogs (round-7 +
  this).
