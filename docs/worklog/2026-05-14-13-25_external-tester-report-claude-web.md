# Sprucelab — External Tester's Report

**Source**: Claude web session (separate instance from the local Claude Code session that drove the run). Captured against the live deploy at `sprucelab.io` on 2026-05-14. Verbatim from the tester except for the title (original read "Spruce Forge — Tester's Report"; the report is about Sprucelab — the live BIM platform — not spruceforge the orchestration brain).

**Methodology**: network capture + console + DOM inspection + direct API probing using the session JWT. Authenticated session, real project data.

**Local-session context**: this report was filed after an earlier turn in which the local Claude Code instance verified deploy freshness (bundle `index-BSA8bz4x.js`, `Last-Modified: Thu, 14 May 2026 11:50:31 GMT`), passed the repo's own public Playwright smoke against the live deploy (2/2), and typechecked latest main clean. The web tester then did what the local session couldn't — driving the auth'd app surface — and produced the findings below.

---

Re-tested with proper instrumentation (network capture + console + DOM inspection + direct API probing using the session JWT). What follows is organized by severity and grouped by root cause, with the relevant evidence inline so you can reproduce or jump straight to the fix.

## Architecture, briefly

The app is a Vite/React SPA at `sprucelab.io` that talks to a Django-style REST API at `sprucelab-production.up.railway.app/api/`, with Supabase JWTs (`sb-rtrgoqpsdmhhcmgietle-auth-token` in localStorage) for auth. The viewer is ThatOpen-based and pulls IFC fragments from a separate FastAPI service at `fast-api-production-474b.up.railway.app`. I noticed the SPA sometimes calls `https://www.sprucelab.io/api/...` (proxied) and sometimes `https://sprucelab-production.up.railway.app/api/...` (direct cross-origin) for the same endpoints — see "Inconsistent API base URL" below.

## P0 — broken on real data

**Project statistics aggregator returns zero elements.** This is the biggest functional bug I found and the source of every "0 elements / 0 mapped" complaint on the dashboard. `GET /api/projects/{id}/statistics/` returns:

```json
{ "model_count": 6, "element_count": 0, "type_count": 6089,
  "type_mapped_count": 0, "material_count": 154, "material_mapped_count": 0,
  "top_types": [], "top_materials": [], ... }
```

Meanwhile `GET /api/models/?project={id}` returns six models whose `element_count` values sum to 88,791 (which matches what the Models page and the 3D Viewer show). So the per-model rollup is correct; the project-level aggregator just isn't computing — `top_types`, `top_materials`, and the mapping counters are all empty/zero too. My guess from the shape is that this endpoint is reading a denormalized column that was never backfilled, or the post-extraction signal that updates project totals isn't firing. The fix is server-side; the front-end is faithfully displaying what the API tells it. While that's broken, *every* dashboard KPI is misleading.

**Verification and IFC Editing are unimplemented routes that ship as empty `<main>` elements.** Navigating to `/workbench?view=verification` or `?view=ifc-editing` mounts the route shell, fetches `/api/me/` and `/api/projects/{id}/`, then renders:

```html
<main class="flex-1 overflow-auto">
  <div class="flex h-full flex-col bg-background text-foreground overflow-hidden">
    <div class="flex-1 overflow-hidden"></div>
  </div>
</main>
```

No errors, no warnings, no further requests — the view component is essentially a no-op. This is much worse than a "Coming soon" placeholder because (a) users have no idea whether they're looking at a bug, a loading state, or an empty result, and (b) you have no stable selector to assert against in tests. These are highlighted features in the sidebar; either gate them behind a feature flag, redirect them, or render an honest empty state with a one-line explanation. The same component pattern would do the job for both views.

**Global sidebar search is wired to nothing.** What looks like a search input is actually a `<button>` with the text "Search". Clicking it produces zero network calls, zero DOM changes, zero console output. If a command palette is planned, ship a tooltip ("Coming soon — `Cmd+K`"); if not, remove the affordance entirely, because right now it's an obvious "this app is broken" trigger for any new visitor.

## P1 — visible bugs with clear root causes

**QTO failure is a script-not-found, not a load failure.** Clicking the QTO tab issues `GET /api/scripts/?name=QTO%20Analyzer`, gets a perfectly fine `200 OK` with `{ "count": 0, "results": [] }`, and the UI surfaces "Failed to load QTO analysis" in red. Two issues stacked: (1) the analyzer script isn't seeded for this project, and (2) the front-end can't distinguish "request errored" from "request succeeded but no analyzer is configured." This should be an empty state with a "Configure QTO Analyzer" CTA, not a load error. Bonus: `/api/scripts/?name=…` taking a name as a query parameter is a bit fragile — if you ever rename the script, every project silently breaks. Consider a stable slug or an `is_qto_analyzer` flag.

**Inconsistent API base URL plus a 403 race on first navigation.** When I navigated to a model, I captured this sequence:

```
9.  GET https://www.sprucelab.io/api/.../statistics/                     200
12. GET https://sprucelab-production.up.railway.app/api/.../statistics/  403
15. GET https://sprucelab-production.up.railway.app/api/.../statistics/  200
```

Three things to look at. First, the SPA is calling both the proxied origin (`sprucelab.io/api/...`) and the direct Railway origin for what appears to be the same endpoint — pick one. The proxied origin is strictly better for cookies, CORS, and observability. Second, the 403 between the 200s suggests the JWT is being attached after the initial request fires, then a refresh/retry succeeds. That's wasted requests and noisy logs; gate fetches on auth-ready. Third, every duplicated call doubles your Railway egress.

**Auth-aware `read_network_requests` capture confirms a "load early, render late" pattern on the dashboard.** I caught the page mid-render — the four KPI cards were all gray skeletons and Project Health / Disciplines literally said "Loading…" before resolving (the screenshot showing this is what convinced me the original "the cards never resolve" reading on the Projects page was wrong; the issue is that they take 4–8 seconds to come back). On a fast connection that's tolerable; on flaky home wifi it looks broken. Two suggestions: (1) keep the skeleton state past 2s but swap to a more reassuring "Fetching project metrics…" microcopy after 4s; (2) the Projects-list metric cards (PROJECTS, MODELS, TYPES, INSTANCES, STORAGE) genuinely never resolve in my session — worth checking whether they're hitting an endpoint at all.

**3D viewer count discrepancy.** Header reads "5 models · 88,200 elements." Filter panel reads "Showing 0 / 559,489 elements." Per-model rows sum to ~88,200. The 559k almost certainly includes IFC property entities (Pset, PropertySingleValue, etc.) — it's an IFC entity count, not a physical-element count. The label "elements" is overloaded. Either rename the filter-panel label to "entities" or filter the count to physical elements only. Right now a user sees three different "element" numbers on the same page.

**Filter persistence in URL leaks across navigation.** The `?d=eyJpZmNfY2xhc3MiOlsiSWZjRHVjdEZpdHRpbmciXX0` filter (base64 of `{"ifc_class":["IfcDuctFitting"]}`) carries from Models → Types → Material Library. The chip *is* visible and dismissible, which is good. But on the Types page the filter is applied to a model that has zero DuctFittings (architecture), and the dashboard reads "Total Types 0/297, Untyped 0/107, Missing Classification 0/297" with no signal connecting the empty result to the active filter. Either scope the filter to the originating view, or surface a banner ("Filtered by IfcDuctFitting — clear filter") above the empty state.

**Model thumbnails on the Models list are all "No geometry".** All six models have status "ready" and clearly have geometry (they render fine in the viewer). This is either a thumbnail-generation step that didn't run, a path that doesn't resolve, or a feature you haven't shipped yet. If the latter, the "No geometry" copy is misleading — say "Preview unavailable" or hide the placeholder entirely.

## P2 — taste, polish, and best practice

**My Page placeholder content is dangerous in this state.** "2 active projects" (you have 3), "3 models uploaded this week" (latest upload is 4 days ago, dashboard recent-activity contradicts), "Created new project 'TEST Project' 1d ago" (doesn't exist). I assume this is hardcoded mock data left over from design. Either wire it up or replace with the "coming soon" treatment you already use elsewhere — fake stats erode trust faster than missing ones, because users assume *everything* on the page is faked once they catch one.

**The 404 page is unstyled.** Hitting `/projects/{id}/materials` (which I typed manually; not a route the app exposes) returns plain black text in the top-left: "Unexpected Application Error! 404 Not Found." This is the standard React Router fallback. Even pre-production, a five-line custom `errorElement` would close a visible quality gap and protect you from any other unguarded route I haven't found.

**Error states are inconsistent across the app.** QTO uses a red inline message; Types/Material Library/Documents use a friendly empty state with a CTA; Workbench renders nothing; routes 404 to an unstyled page. Standardize on one `<EmptyState>` and one `<ErrorState>` component with consistent affordances (icon, headline, body, optional retry). This single change would significantly raise perceived quality.

**i18next is in production but only ever loads "en".** Console shows the Locize promo info log five times. If you're not actually using i18n yet, deferring its initialization saves a chunk on first load. If you are, suppress the promo log (`debug: false` and pass `appendNamespaceToCIMode: false`, or just gate the i18n init on a non-trivial locale).

**Console logger is `loglevel: ERROR` in production.** Good. Combined with `debug: false`, you're probably already swallowing useful client-side warnings. The Workbench blank-page issue produces *zero* output, which means a meaningful component-render warning or thrown error could be hidden today. Consider piping warnings through Sentry/posthog/whatever you use, but at least breadcrumb them server-side.

**`/api/scripts/?name=…` queries by display name.** This is fragile. A renamed analyzer breaks every dependent project silently. Prefer a stable identifier (slug, kind enum, or boolean flag) and treat the name as display-only.

**Cross-origin direct calls to Railway.** Every direct call to `sprucelab-production.up.railway.app` is a CORS preflight + a full TLS handshake (in practice connection-reused, but it's still extra). The cookie/JWT replay attack surface is also wider. Route everything through `www.sprucelab.io/api/...`; you already have the proxy.

**Persistent URL filters need a UX convention.** Right now `?d=base64(filter)` is opaque and survives navigation. Either make it scoped (per-tab, cleared on route change) or visible at the route level (a top-of-page filter bar with clear chips). Power users will love it once it's legible; new users hit a wall when the filter follows them silently.

**Accessibility quick wins.** The Search button has no `aria-label` beyond "Search" and no associated keyboard shortcut hint. The blank Workbench pages have no `<h1>` or status region, so screen readers report nothing. The KPI numbers use color alone to indicate health ("35%" in red); pair color with an icon or text status.

## Suggested order of operations

I'd prioritize roughly in this order: fix the project-statistics aggregator on the backend; ship a single shared empty-state component and use it for Workbench, QTO, and 404; remove or wire up the sidebar Search; replace My Page mock data with real or "coming soon" cards; consolidate API base URLs and fix the auth-race 403s. After that the rest is polish.

## What I'd want next time

If you want me to keep going, two things would help. First, point me at any internal docs for the data model so I can map the dashboard zeros to specific tables/columns rather than guessing from response shapes. Second, give me a test account or a non-production project so I can exercise the upload flow, claim creation, and webhook subscription end-to-end — those are the workflows I couldn't fully test because they'd create real state in your live data.
