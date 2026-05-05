# Session: Embed PR 3 + Landing Editorial Architecture

## Summary
Shipped embed PR 3/10 (`/api/embed/instances` + `/api/embed/capabilities`) as a direct-to-main commit (1581826), then pivoted to redesigning the public landing across three rounds: unify `/` with embedded signup form, scale form+scene proportionally for 4K, and finally rework the entire proportional system on Fibonacci + golden ratio after the user pointed out the geometry felt "fundamentally off." Landed on an Editorial Architecture composition where the empty middle on wide viewports is intentional, falling across the page's golden section.

## Changes

### Embed PR 3 (committed + pushed, in main as `1581826`)
- `backend/apps/embed/{__init__,apps,views,urls}.py` — new Django app with two read-only resolver endpoints
- `backend/apps/embed/views.py` — `embed_capabilities` (manifest) + `embed_instances` (resolver). Truncation at 2500 instances. `_resolve_floor_to_type_ids` routes through `AnalysisStorey/AnalysisTypeStorey` (NOT `IFCEntity.storey_id`, which is unpopulated)
- `backend/config/settings.py` — `apps.embed` added to INSTALLED_APPS
- `backend/config/urls.py` — `/api/embed/` mounted
- `backend/config/views.py` — root `/api/capabilities/` extended with embed pointer
- `tests/unit/test_embed_resolver.py` — 16 tests covering manifest shape, filters, truncation, alias matching, skipped filters. Full unit suite 210/210 green
- `instance_express_ids` deliberately omitted from response (not stored on `IFCEntity`); clients translate `type_id → express_id` from ThatOpen fragment data they already hold

### Landing redesign — three rounds
1. **Unified landing** (`661ac5c`): `/` now serves `Welcome` for all visitor states (anonymous/pending/rejected). Boring slate-50 signup box replaced with embedded form on the diorama. `App.tsx` routing updated; `RequireAuth` redirects pending users to `/` not `/welcome`
2. **Proportional scaling** (`4476a97`): Three fixes in one commit — (a) `minmax(0, 1fr)` on the grid row to stop Three.js from blowing the row past 100vh (the actual cause of the "still getting clipped" bug), (b) form + scene scale with viewport (capped 760/2000), (c) mobile = zoomed-in city backdrop with form centered + frosted glass
3. **Editorial Architecture** (`e3f7e40`, auto-checkpointed, unpushed): Fibonacci spacing tokens (`--fib-2` through `--fib-13` = 8 → 1597px), golden modular type scale (`--fs-caption` through `--fs-display`, base × φ steps), form column locked at Fibonacci 610, scene capped at Fibonacci 1597, column-gap clamp(34, 4vw, 89). Heading tightened to `clamp(42px, 3.5vw, 52px)` so "Apply for access." doesn't wrap inside the 610-panel at 1366

### Direct-to-main + deploy verification
- All 4 open PRs (#3 perf, #4 dev auth bypass, #5 embed PR 2, plus this PR 3) merged or direct-committed. Solo dev pattern is now "direct to main, CI on push, verify after"
- New standing memory: `feedback-verify-deploys-after-push.md` — hit Vercel + Railway healthchecks in the same response as the push, surface failures with the exact command

## Technical Details
**The grid blowout bug** was the most instructive part of the proportional round. Three.js sizes its canvas via `container.clientHeight`, and a bare `1fr` row inherits `min-content` from its children. So the canvas's intrinsic size pushed the row past 100vh, the page scrolled, and the diorama got cut off at the viewport bottom — which the user reasonably read as "still getting clipped on the right." Fix: `grid-template-rows: auto minmax(0, 1fr) auto`. The `minmax(0, …)` is what lets the row shrink below content size.

**Why Fibonacci anchors solved the "feels off" complaint** where viewport-driven `clamp()` did not: at 1920+ the math now produces a visual gap that falls naturally across the viewport's golden section (panel right edge < golden_x < scene left edge). Composition-by-construction, not fitted by numbers.

**The "white space is space too" reframe** changed the design intent. Earlier rounds treated empty middle as a problem to fix by widening either the form or the scene. The Editorial Architecture round treats it as deliberate negative space at golden-section position — the scene is anchored right (viewport edge), the form is anchored left (Fibonacci 610), and whatever falls between is composition, not slack.

## Next
1. **Push `e3f7e40` to origin/main** so Vercel rebuilds with the Editorial Architecture redesign — currently 1 commit ahead locally
2. **Verify deploy** per standing rule: `vercel ls` confirm Ready, hit `https://www.sprucelab.io/` anonymous, confirm form panel renders at 610 + scene at 1597 with golden-section gap on wide viewports, no console errors
3. **User check on proportional intent** before next round — the last commit landed without the user seeing it; if the heading/composition still feels off, that's the input for round 4
4. Embed PR 4 (scoped-token middleware) is the next item in the embed sequence

## Notes
- Mobile design is locked: city backdrop blurred behind, form centered + frosted glass. Don't revisit unless explicitly asked
- The auto-checkpoint commit (`e3f7e40`) captures the Editorial Architecture work — it's a real changeset, not just a snapshot. Push it as-is rather than amending
- Standing memory updates this session: `feedback-verify-deploys-after-push.md` (new), `analysis-tables-are-the-cross-filter-path.md` (new), `data-foundation-status.md` (embed PR 3 status)
