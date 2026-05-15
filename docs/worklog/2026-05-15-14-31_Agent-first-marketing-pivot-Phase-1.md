# Agent-first marketing pivot — Phase 1

**Date**: 2026-05-15 14:31
**Commit**: `828c3dd` on `main`
**Pivot label**: this is the start of a multi-phase agent-first repositioning. Phase 1 is intentionally narrow + revert-safe. If the repositioning gets killed, the listed revert below restores prior behavior in one command.

## Why this is labeled a pivot

Prior to this commit, the public Welcome page led with *"Apply for access."* The repositioning frames Sprucelab as **the BIM platform agents reach for**, with humans treated as the secondary audience. Strategy is documented in `plans/you-re-a-marketing-wizard-cuddly-tarjan.md` (alongside the conversation that drove it). Phase 1 ships the smallest surface that makes the claim provable; Phases 2–3 (docs site, OpenAPI, recipes, Studio, /pulse) are queued behind it.

The strategy memo lists five reasons we picked this moment: (1) ifcfast 0.1.0 hit PyPI 2026-05-14 with audited 25–47× speedups, (2) `/api/capabilities/` + `/llms.txt` + `/.well-known/agent-tools.json` were already shipped but unmarketed, (3) MCP gallery distribution is a new channel competitors can't pivot into, (4) every mutation already supports `dry_run=true`, (5) types-not-entities architecture shrinks agent prompts ~100×.

## What changed (and how each piece reverts)

Everything in this commit is **additive and behavior-preserving by default**. There are no migrations, no schema changes, no auto-enabled features. The blast radius is bounded.

| Change | Revert | Risk |
|---|---|---|
| `frontend/src/pages/Agents.tsx`, `Benchmarks.tsx`, `Marketing.css` (new public routes) | Delete the three files + their two `App.tsx` registrations | None — additive routes |
| `frontend/src/App.tsx` (two new lazy imports + two `path:` entries) | Drop the four added lines | None — additive |
| `frontend/index.html` (SEO foundation: og tags, JSON-LD, canonical, llms.txt link, title) | Revert the file | Reputational only (old generic title) |
| `frontend/src/pages/Welcome.tsx` (hero rewrite + "For agents" link in header) | Revert the file; apply-for-access form is unchanged | Visual only |
| `backend/config/views.py` (capabilities + agent-tools.json + llms.txt: new `mcp` and `parser` keys; cold-start curl in llms.txt) | Revert the file; old keys preserved | None — additive |
| `cli/sprucelab_mcp/` (new package: server + client + pyproject + README) | Delete the directory | None — separate package, nothing imports it |
| `backend/ifc-service/services/ifc_parser_ifcfast.py` (new accelerator module) | Delete the file | None — only imported when the env flag flips |
| `backend/ifc-service/services/ifc_parser.py` (env-gated dispatch in `quick_stats`) | Revert the two edits (`QuickStats.parser_used`, dispatch block) | None — default path is unchanged |
| `backend/ifc-service/requirements.txt` (`ifcfast>=0.1.0`) | Drop the line | Low — Railway will redeploy without it; runtime unaffected unless env flag is set |
| `backend/apps/projects/management/commands/seed_sandbox.py` | Delete the file | None — not auto-run |

**The single-shot revert**:

```bash
git revert 828c3dd
git push origin main
```

This restores every public-facing string, route, and API field to the prior state. Vercel + Railway will redeploy.

**Partial reverts (if we want to keep some pieces)**:
- Keep MCP server + ifcfast wiring, kill the marketing surface only:
  `git checkout 8bb0fd8 -- frontend/index.html frontend/src/pages/Welcome.tsx frontend/src/App.tsx`
  then delete `frontend/src/pages/Agents.tsx Benchmarks.tsx Marketing.css`, commit.
- Keep marketing surface, kill the ifcfast adoption + MCP server:
  delete `cli/sprucelab_mcp/` and `backend/ifc-service/services/ifc_parser_ifcfast.py`, revert the two `ifc_parser.py` edits, drop `ifcfast>=0.1.0` from requirements, commit.

## What's safe-on-by-default

- `SPRUCELAB_PARSER` env var is **unset** in prod → ifc-service still runs the canonical `ifcopenshell.open()` path. Even with the new code in place, no behavior changes until someone deliberately sets `SPRUCELAB_PARSER=ifcfast`.
- `sprucelab-mcp` is not auto-installed anywhere. Marketing copy references `pip install sprucelab-mcp`; the PyPI publish is an explicit follow-up (external write, needs user authorization).
- `seed_sandbox` is a management command. It doesn't run until someone executes `python manage.py seed_sandbox`. The marketing pages reference a sandbox token but the seed hasn't been run; if pre-launch traffic asks for the token, we run the command and surface it.

## What still needs an explicit decision

1. **PyPI publish of `sprucelab-mcp`** — referenced on `/agents`. Until published, `pip install sprucelab-mcp` 404s. The honest fallback is `pip install -e cli/sprucelab_mcp/` from the repo; consider linking that on `/agents` until the PyPI publish lands.
2. **Run `seed_sandbox`** in prod and publish the read-only token on `/agents`.
3. **Flip `SPRUCELAB_PARSER=ifcfast`** on Railway. Plan says wait two weeks of clean run-time before flipping the default; until then it's opt-in for an A/B comparison.
4. **OG image (`/og.png`)** — referenced in index.html but not generated. Vercel will 404 the link until we ship one.

## Verification

After `git push` on main:

- `https://www.sprucelab.io/` — Welcome hero shows the new manifest claim + `/agents` link
- `https://www.sprucelab.io/agents` — /agents route resolves with curl-sticker hero
- `https://www.sprucelab.io/benchmarks` — 7-file audit table renders
- `view-source:https://www.sprucelab.io/` — `<title>` is "Sprucelab — BIM intelligence with a manifest"; og + JSON-LD blocks present
- `curl https://api.sprucelab.io/api/capabilities/` — includes `mcp` and `parser` keys
- `curl https://api.sprucelab.io/llms.txt` — opens with the cold-start curl + MCP install lines

Deploys triggered automatically by the push. Polled during this session; see follow-up notes if status changes.

## Why this is the right wedge (one-paragraph reminder for whoever reverts this)

If we revert, we go back to a perfectly fine pre-launch BIM platform whose API surface happens to be agent-friendly but whose homepage doesn't say so. Forma, Solibri, ACC, Navisworks have human-shaped APIs they cannot pivot from without breaking their existing UX. We can claim the agent layer by construction. The strategy memo explains it; the user pulled the trigger today (2026-05-15) after the audit confirmed (a) every advertised surface is real, (b) ifcfast benchmarks defend the speed claim, (c) Welcome page was the only thing standing between us and the new positioning.
