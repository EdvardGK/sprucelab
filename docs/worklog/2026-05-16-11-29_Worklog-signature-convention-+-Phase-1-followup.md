# Session: Worklog signature convention + Phase-1 followup notes

## Agent signature
- **Agent**: Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`
- **Working tree**: `/home/edkjo/dev/sidehustles/sprucelab`
- **Branch**: `main` @ `de5fea4` → this commit (single commit this session: CLAUDE.md signature spec + this worklog)
- **Session scope**: First project-side use of the new system-wide worklog-signature convention (spec hosted in `~/.claude/CLAUDE.md`); acknowledge the parallel ifcfast-adapter fix and its implications for the agent-first marketing claim.
- **Touched paths**: `CLAUDE.md` (one-line breadcrumb pointing to the global spec), `docs/worklog/2026-05-16-11-29_Worklog-signature-convention-+-Phase-1-followup.md`
- **Parallel sessions observed**: yes — between this session opening and `/worklog`, origin/main accumulated `ab176d8` + `19dde72` (Vercel proxy fixes), `a372d0c` + `a1666ea` (ifcfast adapter fix + worklog), `8434672` + `02cf237` (viewer ViewerPane refactor + `/dev` hub), `1919bf6` + `bcc973f` + `5633c92` + `bdcadf4` + `de5fea4` (dev.md canonical tracker + chore batch + spine reframe). At least two other agent sessions ran in the `/home/edkjo/workspace/sidehustles/sprucelab` worktree concurrently.
- **Supersedes / superseded by**: none.

## Summary
First project-side adoption of the new system-wide **worklog signature** convention. The spec was added to the global `~/.claude/CLAUDE.md` under `## Worklog Standards` (logged separately at `~/.claude/worklog/2026-05-16-11-32_Worklog-signature-convention-system-wide.md`); this project's CLAUDE.md got a one-line breadcrumb pointing there. Trigger: the user observed parallel agents in different worktrees bleeding context into each other across `/clear` boundaries — exactly visible in this repo today, where two worktrees on `main` accumulated five distinct agent sessions' commits in <24 h. A `/clear`'d session reading `docs/worklog/` had no way to tell which entries belonged to its own scope.

## Changes
- `CLAUDE.md` — one-line addition under `## Development Rules › Workflow`: "Worklog signature header: every new worklog starts with the agent-signature block defined globally in `~/.claude/CLAUDE.md` › *Worklog signature*. Do not duplicate the spec here."
- `docs/worklog/2026-05-16-11-29_...md` — this file, the first project-side example of the new signature header.

## Technical Details
Spec lives in exactly one place: `~/.claude/CLAUDE.md` › *Worklog signature header (REQUIRED, system-wide)*. Project CLAUDE.md files only carry a breadcrumb so the rule is reachable from project context, but never duplicated. The signature block sits at the top of every worklog (before `## Summary`) so a `head` or grep can extract it without parsing the body. Format mirrors the git/email "From:" convention. The "forensic, not predictive" framing on the parallel-session field matters: agents declare what they *observed* on origin/main during their session, not what they think other sessions are doing.

## Phase-1 followup (covered earlier this session, before this `/worklog`)
This session also reviewed the parallel agent's work on commits `a372d0c` (ifcfast adapter rewrite) and `a1666ea` (its worklog). The diagnosis I gave to the user earlier was correct and confirmed: the adapter I shipped in `828c3dd` targeted a DataFrame-shaped API (`model.products.iterrows()` etc.) that ifcfast 0.1.0 doesn't have — `model.products` is `list[ProductRow]`, the column is `entity` not `ifc_class`. Every attribute access raised, the try/except caught, the dispatcher silently fell back. For ~6 hours after launch, `SPRUCELAB_PARSER=ifcfast` was a no-op in prod. The parallel agent's fix swaps to `model.type_counts` (pre-aggregated dict) and iterates `model.storeys` as `list[StoreyRow]`. Measured end-to-end speedup post-fix: 4.8× / 3.9× cold on ~40MB files, **21.5× cold on the 380MB Sannergata file** (matches the audit's 21–34× cleanly); warm cache hits clock 69–377×. `type_count` and `material_count` are now correctly zeroed in the ifcfast path because tier-1 doesn't surface `IfcTypeObject` or unique `IfcMaterial` entities — the full extraction path still uses ifcopenshell for those, so downstream callers reading those fields will see 0 in the immediate-feedback flash only.

The integration claim is now provable end-to-end. The `/benchmarks` marketing page currently cites the standalone ifcfast audit (25–47×); a queued follow-up is to add a small "Verified end-to-end through Sprucelab integration" panel with our own 4.8–21.5× cold numbers — strictly more credible than vendor numbers because it's the path actually wired into the product.

## Next
- **Add "Verified end-to-end" panel to `/benchmarks`** citing the integration-path numbers (4.8× / 3.9× / 21.5× cold, 69× / 72× / 377× warm). Same audit table layout, different framing.
- **Flip `SPRUCELAB_PARSER=ifcfast` on Railway FastAPI service** (external config write, needs operator). Then post-flip: upload an IFC, inspect the QuickStats response, confirm `parser_used == "ifcfast"`. Two-clean-weeks clock starts there; earliest default-flip 2026-05-30.
- **Carry-overs from the marketing Phase 1 worklog:** run `seed_sandbox` in prod and surface the read-only token on `/agents`; publish `sprucelab-mcp` to PyPI (external write); generate `/og.png`; decide DNS for `api.sprucelab.io` (Railway custom domain vs keep Vercel proxy).
- **Backfill signatures on prior worklogs?** Not retroactively — the convention applies forward only. Use prior worklogs' commit timestamps + file context to identify their source when needed.

## Notes
- **Two-worktree topology is now visible in commit interleaving**: between this session's open and close, `origin/main` advanced from `bd2d395` (last commit from my prior session in `workspace/`) through nine other-agent commits to `de5fea4`. This is exactly the chaos the signature convention is designed to make legible.
- **The `docs/dev.md` canonical tracker** (introduced in `1919bf6`) was created by a parallel session I had no awareness of until this `/worklog` opened in the other worktree and read the new CLAUDE.md callout. That's a clean illustration of the bleed-through problem — and the new signature convention is the structural fix.
- **No code changes from this session** outside CLAUDE.md + this worklog. The signature convention is meta-process; the actual marketing/ifcfast/proxy work was either done in the prior session (`/workspace`) or by parallel agents (already committed on `main`).
