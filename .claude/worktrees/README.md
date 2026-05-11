# Worktree cleanup recipe

Agent-track worktrees accumulate here from coordinator rounds. Round 1-4 ran multiple parallel tracks each, and Round 4 confirmed 4/4 isolation worked as designed -- branches are harmless but noisy. As of Round 5 there are ~12+ `agent-*` worktrees still on disk, each with its own branch.

The Round 5 coordinator does NOT clean these up automatically. This is a human operation, triggered when the count gets uncomfortable.

## Cleanup recipe

```bash
# 1. List active worktrees
git worktree list

# 2. For each agent-* branch confirmed merged to main (commit cherry-picked):
git worktree remove .claude/worktrees/agent-<name>
git branch -D agent-<name>   # safe ONLY when cherry-picked to main

# 3. Prune stale entries (worktree directory removed manually):
git worktree prune
```

## Safety rules

- **NEVER** use `rm -rf` on a worktree directory. `git worktree remove` is the safe internal path -- it tears down git's tracking of the worktree atomically. Plain `rm` leaves the worktree registered in `.git/worktrees/` and corrupts state.
- Per the global `~/.claude/CLAUDE.md` rule, `rm` is never used without explicit user approval. If a worktree directory is genuinely stuck and must be force-cleaned outside `git worktree remove`, use `gio trash` -- never plain `rm`.
- Only `git branch -D agent-<name>` after confirming the work was cherry-picked or otherwise landed on `main`. Use `git log --oneline main..agent-<name>` to verify nothing unique is left on the branch first.

## Notes

- Coordinator Round 5 spawns worktrees but does not delete them; expect drift to continue between human cleanup passes.
- This recipe is human-operated. Agents (including coordinator tracks) should not run `git worktree remove` or `git branch -D` against `agent-*` branches without explicit user instruction.
