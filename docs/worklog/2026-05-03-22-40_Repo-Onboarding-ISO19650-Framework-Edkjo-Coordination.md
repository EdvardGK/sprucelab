# Session: Repo onboarding + ISO 19650 framework + edkjo coordination

## Summary

Started as a simple "make a PR guide" ask, evolved into building the repo's
cross-machine coordination infrastructure (CONTRIBUTING, PR template, CI,
README) and then into two major plan docs that reframe the platform's
direction: a forward-deployed embeddable dashboard track and an ISO 19650
information delivery framework that retires `health_score` for
requirement-fulfillment metrics. Closed by aligning with edkjo's parallel
work on Issue #1 + PR #2, killing a static-vs-dynamic two-track split, and
posting peer-shaped feedback so we coordinate from the same direction.

The big throughline: Sprucelab is repositioning from "BIM data warehouse"
to "the structured-and-machine-checkable platform for the entire ISO 19650
information delivery cycle" — ordering, contracting, delivering, verifying
— with IDS as the bidirectional interop format and use-case dashboards
(LCA-ready, Clash-ready, Handover-ready) as the operator entry point.

## Changes

### Repo-meta (committed `0a253dc` to main, pushed)

- `CONTRIBUTING.md` — solo PR conventions reframed for cross-machine
  coordination (omarchy + edkjo); branching model; PR scope rules;
  required checks; PR title/body format; "Working from the edkjo box"
  section; cross-machine comms convention (`From/To/Type/Priority`);
  maintenance section
- `README.md` — front-door landing page (quick start, layout, links,
  proprietary owner-only license note)
- `.github/PULL_REQUEST_TEMPLATE.md` — auto-fills PR descriptions with
  why/what/risk/test-plan
- `.github/CODEOWNERS` — auto-request review from `@EdvardGK`
- `.github/workflows/pr.yml` — Postgres + Redis service containers,
  `pytest tests/unit`, `yarn tsc --noEmit` on every PR + push to main

### Plan docs (also in `0a253dc`)

- `docs/plans/2026-05-03-21-15_Forward-Deployed-Embed.md` (~480 lines)
  — embed track: PowerBI-style cross-filter (`DashboardFilterProvider`),
  viewer-as-tile (3D + dashboard share filter context), iframe +
  postMessage embed mechanism, scoped-token auth model, model-quality
  filter dimensions (untyped/orphan/empty container), 10-item robustness
  contract triggered by Speckle's PowerBI plugin failure mode, MVP
  dashboard set, implementation order PRs 1–10
- `docs/plans/2026-05-03-21-30_ISO19650-Framework.md` (~785 lines) —
  backbone: three orthogonal axes (ownership × purpose × time =
  EIR/OIR/AIR/PIR × use-cases × gates), full information-delivery-cycle
  user journey (use case → ordered needs → EIR → BEP → IFC → fulfillment),
  IDS as bidirectional interop carrier, domain models (InformationRequirement,
  RequirementFulfillment, BEPSection, Deliverable, UseCase, UseCaseTemplate,
  ProjectStage), 4-phase cutover from `health_score`, 17 open questions,
  deferred enhancements section

### Edits

- `docs/knowledge/2026-04-15-16-30_Agent-Workflows.md` — Known Gap #3
  marked resolved (local-Postgres path via `just up` + `.env.dev` is real;
  the prod-Supabase concern only applies to the maintainer's `.env.local`
  checkout)

### Memory (`~/.claude/projects/-home-edkjo-workspace-sidehustles-sprucelab/memory/`)

Five new memory files indexed in `MEMORY.md`:
- `forward-deployed-embed-mission.md` (project)
- `user-machines-edkjo-omarchy.md` (user)
- `speckle-powerbi-robustness-lesson.md` (project)
- `feedback-bad-models-are-the-product.md` (feedback)
- `feedback-iso19650-requirement-fulfillment.md` (feedback)
- `ids-as-interop-format.md` (project)

### GitHub

- Issue #1 comment posted — directional alignment with edkjo's Track A
  proposal, kill-static-track decision, takes on 6 decisions + 4 open
  questions, sign-off
  https://github.com/EdvardGK/sprucelab/issues/1#issuecomment-4367504736
- PR #2 comment posted — endorsing v0.1 grounding, riffs on design
  questions (radio scope toggle, flat URL, inline scope viewer,
  token-controlled theme), claim-vs-requirement resolution
  https://github.com/EdvardGK/sprucelab/pull/2#issuecomment-4367505612

## Technical Details

**Reframes captured along the way** (each came from a user clarification
that materially changed the architecture):

1. *PR guide → cross-machine coordination doc.* edkjo and omarchy are
   the same operator's two boxes, both running Claude under the same
   license — not separate humans. Stripped "external contributor"
   framing from CONTRIBUTING.

2. *Popover dashboards → PowerBI-style cross-filter.* User flagged
   Skiplum-pages popover model as wrong for "what's going on with this
   building" workflows. Cross-filter is the moat.

3. *Cross-filter excludes the model → viewer is a tile.* Click IFCWall
   anywhere = filter every tile AND isolate walls in the 3D scene.
   Bidirectional. Server-resolved semantic-to-concrete (`/api/embed/instances?...`).

4. *Robustness as polish → robustness as architecture.* Speckle's
   PowerBI plugin crashes the host process because 3D + BI-host =
   memory contract no plugin can win. Iframe boundary is the single
   biggest robustness win, free with iframe-based embedding. Drove
   the 10-item robustness contract.

5. *"Don't crash on bad input" → "bad models are the product."* User:
   "don't throw errors on the problems the platform is made to help solve."
   Model quality (untyped, orphan, empty container) is filterable data,
   not exceptions.

6. *Health score → ISO 19650 requirement fulfillment.* "4/13 EIRs
   fulfilled" is contractual, traceable, actionable. `health_score` is
   the abstraction that hides the gaps. Cutover plan: 4 phases, ~6 PRs.

7. *Use cases as projection → use cases as entry point.* Users come to
   Sprucelab to "do LCA" / "do clash" — the use case is the door, not a
   filter shape. Drove `UseCaseTemplate` with `skeleton`.

8. *Three axes, not one.* Ownership (EIR/OIR/AIR/PIR) × Purpose (LCA-ready,
   Clash-ready, etc.) × Time (gates / milestones). A requirement lives at
   one point in each. The dashboard is three views over the same data.

9. *Verification platform → entire delivery cycle.* User: ordered needs
   → EIR → BEP. Sprucelab participates at every step, not just verification.
   Most of the industry does this in PDF/Word; structured + machine-checkable
   is the differentiator.

10. *...as IDS.* User: this is the foundation of an IDS authoring system.
    Two-way: generate IDS for distribution; import IDS to populate config.
    IDS round-trip is a success criterion.

11. *Two tracks → one track.* Static rendering was a GH-Pages workaround.
    Inside a stateful Sprucelab, no architectural reason to keep Jinja
    alongside React. Single rendering stack: React + DashboardFilterProvider.
    Snapshots become export features (PDF/PNG/IDS via Puppeteer), not a
    separate pipeline. Killed edkjo's A.5 (output adapters) entirely;
    reframed A.1 (CLI snapshot) and A.2 (visual design + type_coverage,
    not Jinja codebase).

**edkjo's contributions (separate session)**:
- Issue #1 with strategic Track A proposal (5 sub-PRs, 6 decisions)
- Comment 1: A.2 reframe (Skiplum frontend more developed than current
  sprucelab); NS3451 is one of multiple `type_coverage` paths
- PR #2 v0 → v0.1: codebase audit revealed `ProjectScope` is already
  shipped (parent self-FK, `scope_type` enum, `canonical_floors`); the
  4-tab project dashboard already exists; only `Company` + `ProjectUser`
  is genuinely new schema. v0's "scopes JSON config" framing dropped.

**My architect role**: User reminder mid-session — "YOU own sprucelab,
edkjo proposes/insights but you're the gatekeeper and architect." Then
walked back the formality — "edkjo is thinking out loud, just give
feedback and pointers." Final shape of my Issue #1 reply: peer-shaped
directional takes, not formal verdicts. Six decisions answered as
opinions, not gates.

**The dirty working tree**: F-3 perf-pass changes (claims.py,
verification_engine.py, viewer files, hooks) were sitting unstaged at
session start. Did NOT commit them — they're someone else's work in
flight. Only staged the eight files I authored or modified this session.

## Next

1. **Wait for edkjo to lock PR #2 v0.1** (or push v0.2 with my feedback
   folded). Until wireframes settle, no A.x code lands.
2. **Start A.4 first** (embed routes + `apps/embed/EmbedToken`) once
   wireframes lock — unblocks both edkjo's downstream wireframe iteration
   and the framework plan's auth piece. Order picked because it's the
   smallest concrete unblocker for everything else.
3. **Then A.3 (scopes-as-sidebar)** — already grounded on existing
   `ProjectScope`; mostly frontend wiring + a few sidebar component
   additions per v0.1.
4. **Then A.1 (CLI snapshot) + A.2 (design uplift)** — these are both
   bigger and benefit from A.3+A.4 being live.
5. **Skiplum ETL one-off importer** — separate concern, can run in
   parallel with any of the above. `seed_skiplum_projects` management
   command following the `seed_type_definition_layers` pattern.
6. **Framework plan PR 1** (domain models + migrations) — backbone
   work, unblocks the Requirements Fulfillment dashboard. Can run in
   parallel with A.x since they touch different files.

## Notes

- Plan docs are long (480 + 785 lines) but each is the canonical reference
  for its track. Don't try to read both cold — the embed plan depends on
  the framework plan; read framework first if picking up cold.
- 17 open questions in the framework plan + 8 in the embed plan + 5
  design questions edkjo flagged on PR #2 — the plans deliberately
  defer decisions where one-line answers aren't obvious yet. Don't
  start Phase 1 of the framework cutover before answering Qs 1–8.
- CI workflow at `.github/workflows/pr.yml` hasn't run yet — first PR
  to land will tell us if `Backend unit tests` (Postgres+Redis services
  + `pytest tests/unit`) and `Frontend type check` (`yarn tsc --noEmit`)
  are green out of the box. Branch protection is intentionally NOT
  configured — light-touch self-review, not gating.
- Memory files indexed in `MEMORY.md` carry the directional principles
  forward to future sessions on either box. The five new ones cover the
  whole reframe arc — anyone picking up this work cold should skim
  those before reading code.
- The dirty F-3 perf-pass tree from session start is still unstaged.
  Owner of that work needs to finish it on their schedule.
- edkjo and omarchy are now coordinating through Issue #1 + PR #2 with
  the `From/To/Type/Priority` comms convention codified in CONTRIBUTING.
  This is the durable shape going forward.
