# Session: BEP Bugfixes, CRS Lookup, Org Chart Planning

## Summary
Fixed BEP page 404s and 400s from first browser testing, added EPSG/CRS lookup via pyproj to the FastAPI service, made classification system configurable on BEP, and designed + got approval for a normalized org chart / address book system (Company + Person + ProjectRole + RoleRelationship).

## Changes
- **`backend/apps/bep/urls.py`**: Changed `router.register(r'', ...)` to `r'configs'` — empty prefix was catching all sub-routes (disciplines, coordinates, storeys) as pk lookups
- **`frontend/src/hooks/use-bep.ts`**: Updated all BEP config URLs `/bep/` → `/bep/configs/`. Fixed all list queries to use `response.data.results` (DRF pagination) instead of `response.data` directly
- **`backend/ifc-service/api/crs_lookup.py`**: New FastAPI endpoint for CRS lookup via pyproj
  - `GET /api/v1/crs/norway` — curated 34 Norwegian codes: 26 NTM zones, 6 UTM zones, NN2000/NN54, plus compound codes (NTM+NN2000, UTM+NN2000)
  - `GET /api/v1/crs/search?q=...` — text/code search across full EPSG DB
  - `GET /api/v1/crs/{epsg_code}` — direct lookup
  - Response includes `is_compound`, `horizontal_epsg`, `vertical_epsg` for compound CRS codes (prevents double vertical datum selection)
- **`backend/apps/bep/models.py`**: Added `classification_system` field to BEPConfiguration (ns3451 default, omniclass/uniclass/coclass/sfb/custom options)
- **Migration 0004**: `add_classification_system` applied
- **`frontend/src/components/features/bep/BEPOverview.tsx`**: Classification now reads from `bep.classification_system` instead of hardcoded "NS 3451"
- **i18n**: Added `bep.classificationSystems.*` keys (nb + en)
- **`backend/apps/contacts/`**: Django app scaffolded (startapp), not yet populated

## Technical Details
- **Root cause of 404s**: DRF DefaultRouter with `r''` prefix generates `^(?P<pk>[^/.]+)/$` which greedily matches any path segment as a pk lookup. Sub-resource routes like `disciplines/` were consumed before reaching their own viewset.
- **Root cause of 400**: BEP v1 already existed for project G55 (created during earlier testing). `unique_together = [project, version]` constraint blocked duplicate creation. The real bug was `useProjectBEP` not finding it due to pagination — `response.data[0]` on a paginated object `{count, results: [...]}` returns undefined.
- **pyproj**: Installed in sprucelab conda env. `query_crs_info()` supports filtering by `pj_types` and `area_of_interest`. Compound CRS decomposition via `crs.sub_crs_list` gives horizontal + vertical sub-CRS EPSG codes.
- **Org chart plan**: Approved plan at `~/.claude/plans/dynamic-moseying-river.md`. Normalized model: Company + Person (cross-project, contacts app) + ProjectRole + RoleRelationship (projects app). Two relationship types: `reports_to` (hierarchy) and `coordinates_with` (lateral).

## Next
- Build contacts app models (Company, Person) + serializers + views
- Add ProjectRole + RoleRelationship to projects app
- Build frontend org chart (indented tree + toolbar)
- Wire BEP discipline section to read from ProjectRole (Phase 2)

## Notes
- `pyproj` added to sprucelab conda env (v3.7.2), not yet in requirements.txt
- Existing ProjectDiscipline stays alive during transition — BEP page backward compat
- The contacts app was `startapp`'d but models not yet written (session ended)
- FastAPI service was restarted and running on port 8100 with CRS endpoints
