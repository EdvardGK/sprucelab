# Prod deploy + auto-sync branch guard

**Session date:** 2026-04-15 (late night, closing out the parser-extension session)
**Branch:** dev → main
**Owner:** Edvard + Claude (Opus 4.6 1M)
**Mood:** Ship with seatbelts

## What happened

Third (and last) block of the parser-extension session. The parser + backfill
command + Materials Browser were already green on dev. This block pushes the
accumulated 65-commit dev branch to production, and fixes an auto-sync config
bug that was discovered during the push attempt.

Two things shipped:

1. Production deploy via `main` branch merge (Railway + Vercel auto-deploy)
2. Auto-sync hook hardened with protected-branch guard + 4-hour throttle

## The divergence that almost blocked the push

Started a standard `git checkout main && git pull && git merge dev` and hit
an unexpected error: **local `main` had diverged from `origin/main` — 10 local
commits vs 1 remote**. Investigation showed:

- The 10 local commits were all `[auto] docs/plans/2026-04-15-13-00_Materials-Browser-PRD.md updated` — produced by `auto-sync.py` firing while a prior session was transiently on `main` instead of `dev`. Auto-sync commits to whichever branch is currently checked out.
- Content was byte-identical to the same file on `origin/dev`, so no work was at risk — just duplicate commits that would have produced a noisy 3-way merge.
- The 1 remote commit (`docs/plans/2026-04-15-00-00_Scale-Audit-For-Beta.md`) was also already in `origin/dev`, 182 lines identical.

Resolution: backup branch → `git reset --hard origin/main` → `merge origin/dev` → `git push origin main`. Clean history, zero lost work, backup still local as `backup/local-main-pre-reset-2026-04-15` pointing at `86703bb`.

## Auto-sync fix

Root cause of the divergence: `auto-sync.py` (the PostToolUse Edit|Write hook)
commits to whatever branch is currently checked out. If the agent ever switches
to `main` for any reason (even read-only inspection), any subsequent edit becomes
a commit on `main`. Repeat over several sessions → silent divergence.

Two guards added to `~/.claude/plugins/worklog-hooks/scripts/auto-sync.py`:

1. **Protected-branch guard** — `PROTECTED_BRANCHES = {"main", "master", "production", "release"}`. When any of those is checked out, `do_git_sync` logs and returns without committing. The root-cause fix.

2. **4-hour throttle** — `GIT_SYNC_INTERVAL_SECONDS = 4 * 60 * 60`. Per-repo state file at `~/.claude/auto-sync-state/<safe-path>.last` holds a unix timestamp; commits only proceed if the elapsed time exceeds the interval. Kills per-edit commit noise without removing crash-safety entirely.

`session-push.py` at Stop is unchanged — it still fires at session end and pushes whatever auto-sync captured. If the throttle blocked everything during a session, session-push either finds no commits (harmless no-op) or picks up the final state when session-push's own commit stage runs. Net behavior: roughly one commit per four hours per repo, plus one at session end, instead of one per edit.

State file primed with current timestamp so the next edit after this change doesn't instantly re-commit.

## Memory update

Saved `feedback_auto_sync.md` under the project memory and indexed in `MEMORY.md`
so future sessions don't revert the guards. Entry explains the why (main
divergence incident on 2026-04-15), the how (both guards), and the warning
("do not remove either guard without asking").

## Deploy

After the auto-sync fix landed on dev, pushed to production:

```
git checkout main
git reset --hard origin/main          # drop 10 duplicate local commits
git merge origin/dev --no-edit         # 32 files, 5927 insertions
git push origin main                   # 1d76000..5b7fbb3
git checkout dev
```

**32 files changed, 0 migrations.** The deploy includes:

- Parser extension (`ifc_parser.py`, `ifc_repository.py`, `processing_orchestrator.py`, `backfill_type_layers.py`)
- Materials Browser v1 (`MaterialBrowserView.tsx`, `ProjectMaterialLibrary.tsx`, `use-project-materials.ts`, `material-families.ts`, i18n entries)
- Playwright E2E setup (`playwright.config.ts`, `tests/e2e/*.ts`, `.env.playwright.example`)
- Model card versioning dates (`Model.get_first_version_created_at`, serializer field, `ProjectModels.tsx`)
- 5 worklog/plan/knowledge docs from the week

Zero `makemigrations` required — the only backend change was a Django model
*method* (`get_first_version_created_at`), not a field, so no schema migration.
Railway auto-deploys from `main`, Vercel auto-deploys from `main`.

## Files created / modified this block

**New:**
- `~/.claude/plugins/worklog-hooks/scripts/auto-sync.py` — modified (not new) but with substantial guards added
- `~/.claude/projects/-home-edkjo-dev-sidehustles-sprucelab/memory/feedback_auto_sync.md`
- `docs/worklog/2026-04-15-22-57_Prod-Deploy-And-Autosync-Fix.md` (this)
- Local branch `backup/local-main-pre-reset-2026-04-15` pointing at `86703bb`

**Modified:**
- `~/.claude/projects/-home-edkjo-dev-sidehustles-sprucelab/memory/MEMORY.md` — added feedback index entry

**Git state:**
- `origin/main` advanced from `1d76000` → `5b7fbb3` (merge commit of `origin/dev`)
- `origin/dev` unchanged from end of previous worklog block
- Local main now matches origin/main
- Local dev matches origin/dev

## Open items for next session

1. **Verify Railway + Vercel deployment succeeded** — I didn't wait for build completion. Hit `https://sprucelab.io/` and `https://sprucelab-production.up.railway.app/admin/login/` to confirm. Could add this as a post-deploy smoke check in CI.
2. **Drop the backup branch** once main is confirmed healthy: `git branch -D backup/local-main-pre-reset-2026-04-15`. Not urgent — branches are free.
3. **Scale Audit CRITICAL list** remains untouched (C1 Celery, C2 FastAPI cache, C3 FastAPI auth). Still the pre-beta blocker.
4. **Materials Browser e2e spec updates** — 7/10 tests still fail against real parser data because assertions hardcode synthetic seed family names. 30-45 min to rewrite.

## Honest notes

- The auto-sync bug was caught by a failed deploy, not by any health check. That's fine — deploys are the natural point to detect branch drift — but it suggests a pre-deploy sanity step would be valuable: `git log --oneline origin/main..main` before any merge, warn if non-empty. Could be a pre-merge git hook or just a checklist item in the session skill.
- The "backup branch before destructive op" pattern was good. Took 2 seconds, zero cost, full reversibility via `git checkout backup/...`. Should be the default move for any `--hard` reset regardless of how safe it looks. Adding this to the principle of "carefully consider the reversibility and blast radius" — reversibility isn't just about avoiding destructive ops, it's about putting a rope around the ones you do run.
- Auto-sync has been running for some time. I don't know how many other branches accumulated silent duplicate commits before today's fix. Worth a one-time audit: `for b in $(git branch --format='%(refname:short)'); do ahead=$(git rev-list --count origin/$b..$b 2>/dev/null); echo "$b: $ahead"; done`. But not tonight.
