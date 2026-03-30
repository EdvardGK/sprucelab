# TCI Knowledge Scratch

## 2026-03-30

### [knowledge] Multi-instance Claude workflow needs global config support
The TCI protocol (thought capture instance running alongside coding instance) should not be project-specific. It needs to be defined in global Claude config files so it works across sessions and projects. Currently the protocol lives only in a plan file (`~/.claude/plans/tender-discovering-yeti.md`) inside the sprucelab project context.

Key question: where should the TCI role definition live so ANY Claude session can pick it up?
Candidates: `~/.claude/CLAUDE.md` (global instructions), a dedicated `~/.claude/reference/tci-protocol.md`, or a session-start hook that injects the role.

→ PROMOTE TO ~/.claude/CLAUDE.md or ~/.claude/reference/
