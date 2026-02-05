# Session: PRD v2.0 - Type-Centric BIM Intelligence Platform

## Summary

Created PRD v2.0 crystallizing the evolved product vision: a type-centric BIM intelligence platform for professionals who USE models. Updated CLAUDE.md to reflect new architecture and priorities.

## Changes

### New Files
- `docs/plans/PRD_v2.md` - Complete PRD v2.0 document

### Modified Files
- `CLAUDE.md` - Updated to reflect type-centric vision:
  - New title: "Type-Centric BIM Intelligence Platform"
  - Updated Project Overview with new vision statement
  - Replaced "Layered Architecture" with "Types-Only Architecture"
  - Updated Type Warehouse section (TypeBank architecture)
  - Replaced "Bulk Property Editing" with "Type Classification Workflow"
  - Updated Excel Integration (type classification, not property editing)
  - Updated LCA Export (type-based)
  - Added Verification Engine section (MVP priority)
  - Marked BEP System as DEPRIORITIZED

## Key Decisions Documented

| Decision | Choice |
|----------|--------|
| Rule scope | Per-project (ProjectConfig) |
| Gamification | Minimal (professional) |
| Sandwich view | 2D diagram |
| Rule editor | Both GUI + config files |
| BCF export | Phase 2 |
| Change detection | Basic badges |

## Vision Statement

**"Drop your IFC → See all your types → Verify, classify, and track."**

Core insight: Types are the unit of coordination in BIM, not individual entities.

## MVP Priorities

1. Type Dashboard (health scores, progress)
2. Verification Engine (FastAPI + ProjectConfig)
3. Sandwich View (2D material diagram)
4. Rule Configuration (GUI + YAML/JSON)
5. Version Change Badges

## Deprioritized / Cut

- BEP system (too complex)
- Clash detection (not our focus)
- Full property editing (Excel sufficient)
- Graph queries (over-engineered)

## Next Steps

1. Implement Type Dashboard with health scores
2. Build Verification Engine in FastAPI
3. Create 2D Sandwich View component
4. Design Rule Configuration GUI

## Notes

- This PRD supersedes PRELIMINARY_PRD.md and PLAN.md
- Product evolution: BIM Coordination → Property Editing → Type-Centric Intelligence
- Session 031 breakthrough (types-only architecture) validated the type-centric approach
