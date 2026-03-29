# Session: Data-First Strategic Refocus

## Summary
Executed a strategic refocusing of Sprucelab from "type warehouse with a viewer" to "IFC in, actionable data out." Explored the full codebase (frontend 67% dashboard vs 14% viewer confirmed), identified that recent work had been going to dashboard aesthetics while the verification engine (the critical insight-generating feature) remained at 20%. Updated PRD to v2.1, rewrote CLAUDE.md principles, and restructured the TODO around a 5-part data-first sprint.

## Changes
- `docs/plans/PRD_v2.md` -> v2.1: New tagline ("IFC in -> Actionable insight out"), "What We ARE" rewritten as outcomes, viewer demoted to Section 7 "3D Context (Supporting)", dashboards promoted to Section 5 "Insight Layer (Primary Interface)", new "Insight Flow" section, MVP priorities reordered, viewer-first features explicitly deprioritized
- `CLAUDE.md`: New tagline + design principle ("every feature must answer: ready? attention? changed? fix?"), "NOT a 3D viewer with data on the side" added, MVP priorities reordered with dashboard marked done
- `docs/todos/current.md`: Full rewrite structured around data-first sprint (B1-B5), EPD Architecture deferred to Phase 2

## Technical Details
Comprehensive codebase exploration revealed:
- Frontend: 26K LOC, 132 files. 17,470 lines (67%) dashboard/data, 3,554 lines (14%) viewer
- Backend: Types-only architecture fully implemented (2-sec parse). TypeBank, TypeMapping, classification all working. Verification engine has models but no execution engine.
- Infrastructure ready for next features: ProjectConfig.config JSONField for rules, Model.version_diff + parent_model for change detection, Excel endpoints exist but UI not wired

Sprint plan created (in `/home/edkjo/.claude/plans/shiny-greeting-firefly.md`):
- B1: Excel Workflow UI (endpoints exist, ~1 day)
- B2: Verification Engine v1 (checks DB not IFC, ~5 days)
- B3: Dashboard Enhancement (surface verification, ~3 days)
- B4: Version Change Detection (type signature comparison, ~3 days)
- B5: Sandwich View (SVG/CSS diagram, ~2 days)

Key architectural decision: Verification engine checks the database (TypeMapping completeness, material layers), NOT the IFC file. This makes it fast (milliseconds) and avoids ifcopenshell dependency in the verification path.

## Next
- B1: Build ExcelWorkflowBar component (quick win, wire existing endpoints)
- B2: Build Verification Engine v1 (critical path - Pydantic schemas, config loader, type verifier, FastAPI endpoint, Django proxy)
- B3: Dashboard Enhancement (surface verification results as action items)

## Notes
- Task list created with 8 tasks (#1-3 Phase A complete, #4-8 Phase B pending)
- Dashboard Enhancement (#6) blocked by Verification Engine (#5)
- The existing BEP validation system (`ifc-service/services/validation/`) loads rules from BEP tables which are deprioritized. New verification engine will load from ProjectConfig.config JSON instead.
