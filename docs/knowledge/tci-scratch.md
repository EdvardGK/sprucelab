# TCI Knowledge Scratch

## 2026-03-30

### [knowledge] Multi-instance Claude workflow needs global config support
The TCI protocol (thought capture instance running alongside coding instance) should not be project-specific. It needs to be defined in global Claude config files so it works across sessions and projects. Currently the protocol lives only in a plan file (`~/.claude/plans/tender-discovering-yeti.md`) inside the sprucelab project context.

Key question: where should the TCI role definition live so ANY Claude session can pick it up?
Candidates: `~/.claude/CLAUDE.md` (global instructions), a dedicated `~/.claude/reference/tci-protocol.md`, or a session-start hook that injects the role.

**Design**: Opt-in, not always-on. Instance is normal unless user explicitly says "TCI mode" or similar.

**Proposed config approach**:
1. `~/.claude/reference/tci-protocol.md` — full protocol doc (file ownership, routing, awareness, formats)
2. Brief mention in `~/.claude/CLAUDE.md` under a "Multi-Instance Roles" section: "TCI protocol available at `~/.claude/reference/tci-protocol.md`. Activate by telling an instance to run as TCI."
3. No hooks, no skills, no env vars. Just a reference doc + a sentence in global config. Instance reads the protocol on activation.

This keeps it dead simple. Any instance in any project can become TCI by reading one file.

→ PROMOTE TO ~/.claude/CLAUDE.md (add Multi-Instance Roles section) + ~/.claude/reference/tci-protocol.md (create)
