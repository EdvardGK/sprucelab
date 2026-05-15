# Session: Agent-first marketing — Phase 1 shipped

## Summary
Pivoted Sprucelab's public surface from "Apply for access" to "The BIM platform agents reach for." Three commits + one fix-up: marketing pages live at `www.sprucelab.io/agents` and `/benchmarks`, SEO foundation in `index.html`, `sprucelab-mcp` Python package wrapping 8 typed MCP tools, ifcfast tier-1 accelerator opt-in behind env flag, sandbox seed command, capabilities + `/llms.txt` + `agent-tools.json` advertising the new MCP + parser surface. Every change is additive and revert-safe — one `git revert 828c3dd` restores prior state. Detailed pivot worklog written separately at `2026-05-15-14-31_Agent-first-marketing-pivot-Phase-1.md`.

## Changes

- **Plan** at `~/.claude/plans/you-re-a-marketing-wizard-cuddly-tarjan.md` — 6-8 week strategy memo (audience tiers T0/T1/T2, four pillars, Phase 1-3 sequencing, channels, metrics, risks).
- **Frontend marketing routes:**
  - `frontend/src/pages/Agents.tsx` — Discover / Connect / Build three-card layout with curl-sticker hero
  - `frontend/src/pages/Benchmarks.tsx` — 7-file ifcfast audit table + head-to-head vs ifcopenshell, tier-1 caveat callout
  - `frontend/src/pages/Marketing.css` — shared parchment theme (Fraunces + IBM Plex), reusable
  - `frontend/src/App.tsx` — wired `/agents` and `/benchmarks` lazy routes
  - `frontend/src/pages/Welcome.tsx` — hero copy + `For agents` header link; apply-for-access form unchanged
  - `frontend/index.html` — og tags, JSON-LD `SoftwareApplication`, canonical, alternate llms.txt, describedby capabilities, title rewrite
- **Backend agent surface:**
  - `backend/config/views.py` — `/api/capabilities/` gains `mcp` block (install + invocation + Claude Desktop config) and `parser` block (ifcfast + audit_url); `/.well-known/agent-tools.json` mirrors the same; `/llms.txt` adds cold-start curl + MCP install lines + stack section
  - `backend/apps/projects/management/commands/seed_sandbox.py` — idempotent sandbox project + read-only `AgentRegistration` token (one-shot mint on creation, `--rotate-token` re-mints)
- **MCP server:** `cli/sprucelab_mcp/` — own `pyproject.toml`, README, FastMCP server with 8 tools (`capabilities`, `agent_tools_manifest`, `list_projects`, `list_models`, `list_types`, `verify_dry_run`, `list_files`, `list_observations`), minimal httpx client, `sprucelab-mcp` script entry, MIT license.
- **ifcfast adoption (opt-in):**
  - `backend/ifc-service/services/ifc_parser_ifcfast.py` — quick-stats accelerator; lazy imports `ifcfast`; populates the same `QuickStats` dataclass
  - `backend/ifc-service/services/ifc_parser.py` — `QuickStats` gains `parser_used` field; `quick_stats()` dispatches via `SPRUCELAB_PARSER=ifcfast` env flag with fallback to canonical ifcopenshell path
  - `backend/ifc-service/requirements.txt` — `ifcfast>=0.1.0`
- **Vercel proxy fix (commit 01760e0 + 7bf52a9):**
  - Audit incorrectly claimed `api.sprucelab.io` was wired to Railway; it returns Vercel `DEPLOYMENT_NOT_FOUND`. All public copy referencing it would have broken the curl-sticker meme on day one.
  - `frontend/vercel.json` — three explicit rewrites proxy `/api/:path*`, `/llms.txt`, `/.well-known/agent-tools.json` from `www.sprucelab.io` to `sprucelab-production.up.railway.app`; SPA catch-all stays last. No-store cache headers on the proxied paths.
  - All marketing copy + MCP client default URL flipped from `api.sprucelab.io` to `www.sprucelab.io`.

## Technical Details

- **Strategy first**: 3 parallel Explore agents mapped the existing agent-facing surface, ifcfast state (PyPI 2026-05-14, 0.1.0, MIT, 25–47× audit numbers), and the marketing surface gap. Findings drove the plan; the plan drove the implementation. The audit revealed the infrastructure was 80% built — `/api/capabilities/`, `/llms.txt`, `/.well-known/agent-tools.json`, the dry-run-on-every-mutation pattern, the Typer CLI, HMAC-signed webhooks, agent token registration, comprehensive `API_SURFACE.md`. The campaign is marketing-led integration over the existing surface, not new infrastructure.
- **Why the curl-sticker meme**: Stripe-style `curl https://api.stripe.com/v1/` is the model — one elegant memorable line ends every blog post, every README, every social card. Sticker chosen as the "thing on a t-shirt" of the campaign.
- **ifcfast adoption shape**: ifcfast is one day old on PyPI; couldn't make it the default tier-1 parser yet. The wedge: gate it behind `SPRUCELAB_PARSER=ifcfast` env flag with full ifcopenshell fallback. Marketing the 25–47× speedup is defensible because the audit numbers are real (`docs/history/audit/issue-02-*.md` in the ifcfast repo). Default-flip queued for after two weeks of clean run-time.
- **MCP server is a thin shim**: 8 typed tools that just forward HTTP. No custom protocol, no special error handling — agents get the literal Railway response. Same pattern ifcfast itself uses for its 18-tool MCP server (`pip install 'ifcfast[mcp]'`). Same pattern we should evangelize: the MCP server is just the API surface in a different envelope.
- **Vercel/Railway proxy gotcha**: Vercel rewrites work, but Vercel's edge cached the SPA-fallback responses for `/api/*` BEFORE the rewrites landed. Even after the rewrite committed, the edge keeps serving stale `text/html`. Fix: explicit `no-store` cache headers on the proxied paths (commit 7bf52a9, Vercel-CDN-Cache-Control header is the one Vercel honors). New routes (`/llms.txt`) had no cached entry to poison — they started working immediately.
- **Revert safety**: every change is additive. No migrations, no schema changes, no auto-enabled behavior. ifcfast import is lazy; the env flag is unset in prod; the MCP package is in its own dir and nothing imports it. The whole pivot is `git revert 828c3dd` plus three subsequent fix-ups.

## Next

1. **Vercel edge cache eviction** — `/api/*` at `www.sprucelab.io` still serves the cached SPA shell. Either wait (passive), or `vercel deploy --prod` from a logged-in shell to force a fresh build that purges the path cache. As soon as one fresh `/api/capabilities/` response lands at the edge, agents hitting the marketing URL get the real JSON.
2. **DNS-level fix (preferred long-term)** — configure `api.sprucelab.io` as a Railway custom domain. Add to Railway → custom domains → `api.sprucelab.io` → CNAME on the DNS side. Then we don't need Vercel proxying.
3. **Run `seed_sandbox` in prod** — `python manage.py seed_sandbox` on Railway shell; copy the printed token; surface it on `/agents` (current page just references the existence of a sandbox).
4. **Publish `sprucelab-mcp` to PyPI** — external write, needs explicit auth. The package is ready (`cli/sprucelab_mcp/`); the marketing copy already advertises `pip install sprucelab-mcp`. Until published, that command 404s.
5. **Phase 2 work (queued from the plan):**
   - `drf-spectacular` for `/api/schema/` + `/api/schema/swagger/`
   - `spruce init` scaffolder (`spruce init my-agent --lang python|typescript`)
   - Docs site at `/docs` (Mintlify or markdown route)
   - Wire the advertised-but-not-yet-implemented webhook events `types.classified` + `quantities.extracted`
   - MCP registry submissions (Anthropic gallery, mcp.so, openmcp.org, Continue.dev)
   - `sprucelab-recipes` GitHub repo with 5 starter agent recipes

## Notes

- **The audit had one factual error** — `api.sprucelab.io` is NOT wired to Railway; it 404s from Vercel. The fix shipped (Vercel proxy on `www.sprucelab.io`); but always verify external infrastructure claims before quoting them in marketing copy.
- **OG image (`/og.png`) is referenced but not yet generated.** Vercel will 404 the link until we ship one. Minor cosmetic issue; not blocking.
- **The user explicitly asked for revert-labeling.** This is a major pivot. The pivot worklog (`2026-05-15-14-31_*.md`) documents the one-shot revert (`git revert 828c3dd`) and partial-revert recipes if we want to keep MCP + ifcfast but drop marketing surface, or vice versa.
- **Strategic moment**: ifcfast 0.1.0 hit PyPI yesterday (2026-05-14). Whole campaign hangs on it being real. Verified: it's MIT-licensed, owned by the user, with audited 25–47× speedups on 7 production IFCs. Tier-1 caveat stated plainly on `/benchmarks`.
- Commit chain: `828c3dd` (Phase 1) → `76a0911` (pivot worklog) → `01760e0` (DNS / api.sprucelab.io → www) → `7bf52a9` (Vercel edge no-store).
