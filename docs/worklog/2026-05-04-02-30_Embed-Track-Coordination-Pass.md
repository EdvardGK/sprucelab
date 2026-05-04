# Session: Embed track coordination pass (edkjo box)

## Summary

Cross-machine coordination session for the forward-deployed-embed track,
worked from the edkjo box with skiplum-pages context to hand. Opened the
discussion on sprucelab (zero issues prior to this session, set the comms
convention to mirror spruceforge's), shipped wireframes through three
versions as the picture sharpened, and produced first-pass answers to
omarchy's 10 open questions on the embed plan.

Net: design branch `design/dashboards-wireframes` is the live conversation
surface; PR #2 carries v0.2 wireframes + edkjo answers doc; both reading
omarchy's `2026-05-03-21-15_Forward-Deployed-Embed.md` and
`2026-05-03-21-30_ISO19650-Framework.md` as inputs.

Holding implementation. Four asks to omarchy gate the next code PR
(primitives directory, CLI subcommand naming, highlight-mode spike owner,
ModelQualityIssue app placement).

## What landed

### Skiplum-automation (cleanup)

- Discarded the staticrypt branch (`feat/staticrypt-per-client`) and the
  uncommitted local edits to `build_all_dashboards.py`, `requirements.txt`,
  `docs/HANDOFF.md`, `encrypt_pages.py`. The Supabase-magic-link gate
  superseded the static-encryption approach before that branch had merged,
  so it was dead code on disk. `skiplum-automation/master` is back to clean
  state at the original tip.

### Sprucelab — issue #1 (proposal)

- `[edkjo] Dashboards subsystem — forward-deploy + Speckle-style embed (PR
  proposal)` — first issue ever on the sprucelab repo. Set the comms
  convention by mirroring spruceforge's inline `From:` / `To:` /
  `Type:` / `Priority:` block. Body covered the strategic shape (5 sub-PRs),
  six decisions worth omarchy's input, and what's already on edkjo to hand.
  Addendum after the user surfaced: "type viewer + dash in skiplum-pages
  is more sophisticated, not locked into legacy NS3451 mapping" — reframed
  A.2 as frontend-uplift-driven-by-Skiplum-templates rather than
  port-templates-to-sprucelab-data-shape.

### Sprucelab — PR #2 (design branch with three wireframe versions)

Branch: `design/dashboards-wireframes`. Open as draft PR #2.

- **v0** (commit `3e48be0`) — first pass. Got the hierarchy intuition right
  (Company → Project → Scope → Data) but treated scopes as JSON config and
  most of the surface as greenfield.
- **v0.1** (commit `b31b0c3`) — rewritten after a systematic review of
  sprucelab (re-cloned into `~/workspace/sidehustles/sprucelab` per the
  user's correction; my earlier work in `~/workspace/toolkit/sprucelab`
  was the wrong placement). Added §0 reality-check table mapping every
  concern to existing/new code. Corrected scope semantics to match the
  shipped `ProjectScope` model (tree, scope_type enum, canonical_floors).
  Narrowed net-new schema to just `Company` + `ProjectUser` M2M + embed
  routes.
- **v0.2** (commit `321dca9`) — rewritten again after omarchy pushed the
  embed plan + ISO 19650 plan to `main` (`0a253dc`). v0.1's
  page-per-data-type structure was the wrong frame; v0.2 is single
  dashboard surfaces composed of tiles, all under a
  `DashboardFilterProvider`, with the 3D viewer as one tile. Three MVP
  dashboards mocked: Requirements Fulfillment (default), Type Browser,
  Floors Overview. Cross-filter worked example in §9 (click → reproject →
  URL update). Mobile/responsive degraded mode in §11.

### Sprucelab — edkjo answers to embed open questions (commit `321dca9`)

`docs/plans/2026-05-04-02-00_Embed-Open-Questions-Edkjo-Pass.md`. First
pass at all 10 open questions in omarchy's embed plan, grounded in
skiplum-pages where relevant. Headlines:

| Q | Position |
|---|---|
| 1 | Lift skiplum-pages primitives into `frontend/src/components/dashboard-primitives/` (Sidebar.NavSection, MetricCard, CoverageBar, TrafficLightBadge, DisciplineRow). CSS-only patterns transfer; Jinja templates inform but aren't lifted. |
| 2 | Truncation default 2500 (not 5000), per-project override via ProjectConfig. Smoke test sketch for pre-PR-7a. |
| 3 | CLI-only token issuance for v1: `spruce embed pass {create,list,revoke,refresh}`. EmbedPass admin registration is free. Defer dedicated UI. |
| 4 | Extend openly, version-bump on breaking. Stable invariants: `mode`, `selected_express_id`, `project_id`. Risk flagged on nested `quality.*` namespace. |
| 5 | Ghost-mesh prior, but spike needed. Modes A–D outlined for the spike. |
| 6 | `skiplum-reports/dev/embed-host.html` (one-file, served via existing `python -m http.server` idiom). No second compose service. Snippet included. |
| 7 | CSS Grid auto-fill + minmax. Tiles declare min_width via CSS custom prop. ViewerTile hides below 600 px (Robustness #8). |
| 8 | "Save filter as view" is the high-ROI item — graduate to first PR after MVP. Multi-project dashboards wait for ask. Custom-tile DSL is a hard no. |
| 9 | Dedicated `ModelQualityIssue` table. Migration sketch with indexes for project + issue_type, model + ifc_class, model + express_id. ProcessingLog stays as parser narrative. |
| 10 | Ship 4 issue types at MVP (untyped, orphan, empty_container, missing_pset). Defer 3 (invalid_geometry, broader missing_relations, missing_material). |

Asks back to omarchy on Q1, Q3, Q5, Q9 — gate the next code PR.

## Push + verification

Each push verified before moving on:

- Sprucelab issue #1 created, addendum posted; `gh issue view 1` returns
  expected body.
- PR #2 created as draft from `design/dashboards-wireframes` → `main`;
  Vercel preview generated at
  `sprucelab-git-design-dashboards-wireframes-skiplum.vercel.app` (Ignored
  by deploy filter, which is correct — docs-only branch).
- Three commits to the design branch (`3e48be0`, `b31b0c3`, `321dca9`)
  all pushed cleanly. `gh pr view 2 --json commits` confirms the three.
- Three comments on PR #2 / Issue #1 trace the conversation; latest
  comment (`#issuecomment-4367560649`) summarizes the v0.2 + answers
  pair for omarchy.

`gh issue list --repo EdvardGK/sprucelab` final state: 1 open issue (#1),
1 open draft PR (#2), no other activity.

## Technical reframings absorbed from omarchy's reply

omarchy responded by pushing 1890 lines (`0a253dc` on `main`), not by
commenting. Three reframings landed:

1. **Cross-filter is the product, not the framing layer.** PowerBI-style:
   every tile (charts, tables, viewer) projects from one shared filter
   context. Click a wall in any tile → all re-project, viewer
   isolates/highlights. Bidirectional. The viewer is a tile, not a
   pinned-right panel. Killed v0.1's page-per-data-type structure.
2. **`health_score` is retired.** Replaced with "X of Y EIRs fulfilled" —
   per the sibling ISO 19650 plan, which adds InformationRequirement +
   RequirementFulfillment + BEPSection domain models. The ISO 19650 plan
   is the prerequisite for the Requirements Fulfillment dashboard
   (MVP #1 in the embed track).
3. **"Bad models are the product, not the failure mode."** Quality
   issues = first-class filterable data (`quality.untyped`,
   `quality.orphan`, etc.), never error conditions. The viewer renders
   broken geometry and quality issues become queryable dimensions.
   Skiplum-pages already does this implicitly; omarchy made it the
   explicit operating principle.

Plus a 10-item Robustness contract that's binding for every embed PR
(iframe boundary, hard memory cap with LOD paging, isolated tile failures,
debounced filter changes, WebGL recovery, explicit teardown, no
host-page trust, degraded mode, bounded query budget, telemetry).

## Next

Blocked on omarchy's responses to:

- Q1 — primitives directory home
- Q3 — CLI subcommand naming
- Q5 — highlight-mode spike owner
- Q9 — ModelQualityIssue app placement

When those land, the natural next move is omarchy's plan PR 2
(`embed: DashboardFilterProvider + filter context types`) — pure types and
provider, no UI changes. Either machine can take it; edkjo has slightly
better skiplum-pages context for the URL serialization decisions, but
omarchy owns the codebase shape. Tracking via PR #2 conversation.

After PR 2 lands: PR 3 (`/api/embed/instances` resolver) is the next
inflection point — that's where backend semantic→concrete resolution
happens and the truncation threshold from Q2 gets a real default.

## Notes

- Initial sprucelab clone went into `~/workspace/toolkit/sprucelab` —
  wrong per the user's workspace convention (toolkit is for
  Skiplum-adjacent automations; sprucelab is omarchy-primary, lives under
  sidehustles). User caught it; re-cloned into
  `~/workspace/sidehustles/sprucelab`. The systematic review I should
  have done up front happened only after that correction. Lesson:
  workspace placement matters for routing intuitions about where work
  belongs.
- Vercel + Supabase wiring on sprucelab was an unknown to me at the start
  of the session — found it via the Vercel bot comment on PR #2
  (`vercel.com/skiplum/sprucelab` exists, Supabase project
  `rtrgoqpsdmhhcmgietle` connected with branching). That collapsed
  v0.1's "stand up Vercel + Supabase for Skiplum" plan into "site.skiplum.no
  is a custom domain on the existing sprucelab Vercel project; Skiplum
  is a tenant of sprucelab." Significant simplification.
- ISO 19650 plan is 805 lines and reframes the entire authoring side
  (EIR drafting + signoff + BEP). Not in this session's scope, but the
  Requirements Fulfillment dashboard depends on its domain models. Worth
  a deeper read before contributing to the authoring side.
- Convention for plan-doc filenames in sprucelab: `YYYY-MM-DD-HH-MM_Title.md`
  in author's local time (omarchy uses Argentina; edkjo uses Norway).
  Follow the convention.

## References

- Issue: https://github.com/EdvardGK/sprucelab/issues/1
- PR: https://github.com/EdvardGK/sprucelab/pull/2
- Branch: `design/dashboards-wireframes` (head `321dca9`)
- omarchy's plans on `main`:
  - `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md`
  - `docs/plans/2026-05-03-21-30_ISO19650-Framework.md`
  - `CONTRIBUTING.md`
- This session's artifacts:
  - `docs/design/wireframes-v0.md` (now v0.2)
  - `docs/plans/2026-05-04-02-00_Embed-Open-Questions-Edkjo-Pass.md`
