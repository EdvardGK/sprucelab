# Session: Architecture arc — Grouping axes / Opening lifecycle / Tolerance / Anti-opening / Rules-engine strategy / Positioning anchor

## Summary

Continuation of `2026-05-13-22-04` (storey verification + GUID bridge already shipped). This was a pure architecture conversation — no code shipped — that crystallized the full data + rules + lifecycle vision and locked in the strategic positioning anchor. Seven memories written and seven tasks queued covering every layer from per-object data foundation to the marketplace template economy. Final move: user reset the positioning frame to **BIM coordination first, not viewer first** and I saved that as the drift catcher for future sessions.

No commits to code or `main` in this session — only memory + task work. Top of `main` unchanged: `1fd522c` (worklog from 22:04).

## Changes

### Memory written (seven files, all in `~/.claude/projects/-home-edkjo-workspace-sidehustles-sprucelab/memory/`)

- **`grouping-axes-data-foundation.md`** — Spaces, Zones, Systems, Openings each become first-class `AnalysisX` tables with GUID. Layer 3a adds the grouping axes; Layer 3b populates `IFCEntity` per-object so every IFC element is queryable on every dimension (class, type_guid, storey_guid, space_guids[], zone_guids[], system_guid, qa_status). Foundation for QTO + per-room/floor/space queries.
- **`opening-lifecycle-spec-verify-build.md`** — Openings (and any item-with-spec) are build artifacts moving through 3 stages: decision gate (OK/Not OK in this location), design binding (firerating, drawing detail #, product manual), field execution (generate checklist → fill in with photo + product number + sign-off). Same pattern works for doors, dampers, penetrations, MEP terminals. Closes the design→build→as-built loop.
- **`tolerance-rules-go-nogo-automation.md`** — Per-project, per-discipline rule engine that auto-classifies openings (and any item) as `auto_approve` / `needs_approval` / `auto_reject` based on size, distance-to-neighbor, parent class/properties. Drives Stage 1 of opening lifecycle. Marketplace template angle: sellable rulesets per-discipline.
- **`anti-opening-structural-constraint-zones.md`** — The inverse of an opening: a spatial zone (`critical_structure`, `service_void`, `fire_compartment_boundary`, `reinforcement_required`) where openings are forbidden/restricted/spec-augmented. Tolerance rules gain `intersects_zone_kind` / `crosses_zone_kind` predicates.
- **`spatial-requirements-generic-engine.md`** — User generalized to "this could go for anything: door radius, wheelchair circles, cable-tray pull, free ceiling height, daylight, sight lines, plumbing slope". Generic abstraction: `SpatialRequirement { kind, geometry, rule, attached_to, severity, source, template_id }`. Auto-instantiated from element placement (every `IfcDoor` → `door_swing` requirement). One engine, marketplace-extensible `kind` catalog. TEK17 / NS 11001 / NS-EN 12464 sellable as IDS packs.
- **`rules-engine-strategy-build-vs-integrate.md`** — Honest assessment of build vs buy. Solibri is 20 years ahead on geometric topology; don't displace. Three tiers: Tier 1 native (size/distance/containment/attribute, weeks of work), Tier 2 IDS authoring + Solibri ruleset export (open-standard portable artifacts), Tier 3 integrations (Solibri for hard checks via roundtrip, Speckle for transport, Reduzer for LCA, BCF for issues). Moat = agent-orchestrated multi-engine dispatch.
- **`positioning-bim-coordination-first.md`** — User's explicit anchor: "I've been saying this from the start: BIM coordination first, not viewer first." Competes with Solibri Office / ACC Model Coordination / BIMcollab / Navisworks — not with viewers. Viewer is a tool of coordination, never the headline. Drift catcher: re-anchor whenever strategy framing forgets "coordinator".

### Tasks queued (#15–#22, all pending)

- **#15** Layer 3a — Spaces / Zones / Systems / Openings as `AnalysisX` tables
- **#16** Layer 3b — populate `IFCEntity` per-object (table exists, unpopulated)
- **#17** Rooms + Systems sidebar tab (built on Layer 3a + dashboard engine)
- **#18** QTO surface — openings-per-floor needing QA/QC
- **#19** Opening lifecycle — 3-stage gate→spec→field
- **#20** Tolerance rule engine (auto-classify go/no-go)
- **#21** Structural constraint zones (anti-opening; first concrete kinds before #22 generalizes)
- **#22** SpatialRequirement engine (generic; supersedes #21 once shipped)

### MEMORY.md updates

Index now has 76 entries (was 73). Three new "what we are / how we work" axes:
1. Data foundation roadmap (Layer 3a/3b)
2. Coordination engines (tolerance / lifecycle / spatial-requirement)
3. Positioning anchor (BIM coordination first)

## Technical Details

This session was conversational architecture work — every memo went through 1-2 rounds of user correction:

1. **Openings non-physical exclusion question** — user asked "by non physical, are you including openings, spaces etc?" Verified my exclusion list (`IfcOpeningElement`, `IfcOpeningStandardCase`, `IfcAnnotation`, `IfcGrid`, `IfcGridAxis`, `IfcVirtualElement`) is complete and that spaces are already excluded upstream at the parser via `_SPATIAL_CLASSES`.

2. **Spaces + floor mapping** — user pushed: "Knowing what floor a space belongs to is very important." This led to Layer 3a + the sidebar tab (Rooms+Systems together as one tab with sub-views).

3. **"Even by object"** — escalated Layer 3a to Layer 3b (per-object `IFCEntity`). Every IFC element queryable by every dimension.

4. **Field-execution + as-built** — user added "becoming an item on a field checklist where the builder documents with product spec/number + photo." This crystallized the 4-phase lifecycle, refined to 3-stage on the user's follow-up ("Opening: OK/Not OK. If ok, design specs ... generate checklist - fill in checklist").

5. **Tolerance rules** — "hole less than 50mm and x mm away from other hole: go ahead. 51mm or bigger: Needs approval by model owner." This is the automation backbone; without it every opening hits human review.

6. **Anti-opening** — "Just like we assign opening elements, there could be a reinforcement element. Critical structure." The inverse abstraction. Saved as the first concrete kinds.

7. **Generic spatial requirement** — "this could go for anything, including door radius, functional accessibility zones like wheelchair circles but also free space for pulling data or power cables on cable trays. Free height over top of floors etc." This is the big unification — `SpatialRequirement` as the universal abstraction. TEK17 / NS 11001 / NS-EN 12464 fall out as marketplace packs.

8. **Build vs integrate** — user got honest: "I dont know how hard this is to build. Solibri is the king ... We could output Solibri rulesets and IDSes based on the platform configs, but the killer feature would be to do it all. I assume we need to have integrations with solibri, reduzer etc these days anyway. Speckle even." Saved the three-tier strategy: native for tractable rules, IDS-first for open-standard export, integrations for the hard work.

9. **Positioning correction** — final user message: "I've been saying this from the start: BIM coordination first, not viewer first." Saved as `positioning-bim-coordination-first.md` with explicit drift catcher.

The conversational arc moved from a concrete bug (orphan inflated) → data foundation → engines → positioning. Each escalation generalized the previous level cleanly. By session end, the platform vision was fully expressed and aligned with the existing CLAUDE.md statement ("For BIM professionals who USE models, not create them").

## Next

1. **Phase 1 of #14 (Dashboard engine extraction)** — still the highest-leverage next move. Extract Types-page cross-filter into `useDashboardFilter()` + `<DashboardSurface>`. Lock in pure-JSON definitions + versioned source paths + explicit binding slots so marketplace + user-builder fall out later.
2. **Layer 3a (#15) — grouping axes** — can run in parallel with #14 since it's pure backend extraction. `AnalysisSpace` + `AnalysisZone` + `AnalysisSystem` + `AnalysisOpening` with positions, GUIDs, transitive storey link. Unlocks #17, #18, #19, #20, #21, #22.
3. **Verify render-nudge on prod** — `7bc57ea` shipped last session; quick chrome-devtools check that the floor filter repaints without camera move.
4. **Layer 2 GUID bridge** — treemap → IFCType.guid → viewer type isolation. Single-PR ship using layer-1 pattern.

## Notes

- This was a pure-conversation session. Zero commits. The leverage is in the memory: future sessions arriving cold can read the index + the seven new files and understand the platform thesis end-to-end.
- The user is anchored on **BIM coordination** as the category. Stop drifting toward "compliance platform" / "lifecycle database" / "viewer plus". The memory has a drift catcher to detect this in future sessions.
- The data foundation has matured into a layered model (Layer 1 storey ✅ shipped; Layer 2 type queued; Layer 3a grouping axes; Layer 3b per-object). The 3-layer split is the right abstraction — Layer 1 was the "prove the GUID bridge pattern" ship; Layer 2 reuses it cheaply for types; Layer 3 generalizes to every grouping axis + every element instance.
- The marketplace direction is now load-bearing on a single decision: every artifact (dashboard, ruleset, requirement pack) is **pure JSON**. No embedded code. Sandboxing falls out for free. Same JSON serves agents, humans, marketplace, and inter-tool transport.
- Render-nudge (`7bc57ea`) should be re-verified — but if it's flaky, the next escalation is hooking into OBC.Components' render loop via `world.update()` or dispatching a synthesized `'rest'` event on camera-controls instead of calling `renderer.render()` directly.
