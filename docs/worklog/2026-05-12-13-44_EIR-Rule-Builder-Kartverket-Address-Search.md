# Session: EIR rule-builder + Kartverket adressesøk

## Summary

Continuation of the 11:40 Types v2 / viewer-filter session. Four commits
(`bb4366f` → `837b797`) shipped to `main`, all reaching Vercel + Railway
green. Two themes: (1) tightened the backend boundary around untyped
rows (frontend already had a guard — now backend matches), and (2) a
ground-up reframe of `/projects/:id/settings` from a fixed
EIR/BEP/Status triad into a composable EIR rule builder with a left
palette + sortable workspace + Kartverket address search.

Why it matters: the third try at the EIR finally lands at the user's
actual mental model — "EIR is the set of rules the project commits to,
not a wall of prose with editor controls glued on." The previous two
attempts (prose blockquote → per-section configurator) both treated EIR
as fixed-shape sections. This session removes that framing entirely.

## Changes

### `bb4366f` — fix(types): null-safe `/api/types/{id}/instances/`
Backend hardening to match the existing frontend workaround. When
`IFCType.type_guid` is null (untyped IfcOpeningElement / void-style
entities), the endpoint returned 200 + `{ error: 'no_type_guid' }`
without ever hitting FastAPI at `/types/None/instances`. Side cleanup:
all error returns now use `{ error: <enum>, error_message: <prose> }`
shape so the frontend can branch on a stable code.

### `4294c4f` — feat(settings): EIR-column-as-configurator (pilot)
First EIR-as-form attempt. Defined `EirField` / `SECTION_EIR_FIELDS`
schema and replaced the prose blockquote in the EIR column with editor
controls (toggle, multiselect, number+unit) for "Coordinates & Geometry"
only. Other sections still prose. User feedback after this commit was
clear: "the config module is not what I want still" — the triad layout
itself was the problem, not just the EIR column inside it.

### `3ec57ec` — feat(frontend): drop Types v1 + expand NTM zones
`ProjectTypesPage` no longer branches on `?v=2`. v2 is the only Types
page; legacy `components/features/warehouse/TypeBrowser` stays as
deprecated reference. EIR's CRS multiselect now lists each EUREF89/NTM
zone (5–14) individually with EPSG codes, plus UTM 32N/33N/35N. Also
clarified that EUREF89 = ETRS89 (Norwegian alias); "ETR89" is not a
real term.

### `837b797` — feat(eir): rule-builder rebuild
Full restructure of `/projects/:id/settings`:
- **Left sidebar palette** lists 15 rule kinds, grouped (Geometry /
  Scope / Standards). Click to add. Same kind addable multiple times.
- **Right workspace** is a list of sortable cards (one per active rule),
  each rendering its own typed config form. Drag handle reorders via
  `@dnd-kit/sortable`.
- **Searchable multiselect** via `cmdk` (already in deps) — necessary
  because CRS has 14 NTM/UTM rows and classification has 5+ standards.
- **Kartverket Geonorge adressesøk** lifted verbatim from
  skiplumXge-react: debounced + `AbortController` + `searchId`
  stale-response guard. Wired on basepoint, control_point, site_plan
  rules. Returns WGS84 lat/lon + municipality + gnr/bnr.
- BEP and Status columns intentionally dropped from this page — they're
  downstream of EIR being defined and land in a later pass.
- Deleted `sections.ts` (unused after rebuild).
- New deps: `@dnd-kit/{core,sortable,utilities}`.

State is local-only. Persistence ships with Phase 7 BEP-backend
restore — `ProjectEirRule { kind, config, position }` is the eventual
wire shape and `eirRules.ts` is intentionally close to it.

## Technical details

**Skiplumxge reconnaissance**: user asked me to find how they connected
to OpenStreetMap + Kartverket for "adressesøk". Located at
`~/workspace/skiplum/dev/skiplumXge-react/`. Pattern:
- Address search → Kartverket Geonorge REST
  (`https://ws.geonorge.no/adresser/v1/sok`, `fuzzy=true`, `utkoordsys=4326`).
  Free public API, no key. Returns adressetekst + WGS84 lat/lon +
  kommune + gnr/bnr.
- Building polygons → OSM Overpass API (`overpass-api.de` w/
  `overpass.kumi.systems` backup), OQL `way["building"](around:…)` +
  multipolygon relations.
- Map render → Leaflet w/ CartoDB dark basemap (NOT Kartverket WMTS —
  swappable for sprucelab if we ever embed a real map).
- Hook pattern → debounced query → AbortController on prev request +
  searchId monotonic counter so stale slow responses don't clobber the
  current one.

**Map embed deferred**: this session only ships address search; the
actual basepoint-picker map (Leaflet + Kartverket WMTS or OSM) is a
follow-up. Address search alone resolves the address → coords without
the visual confirmation step.

**Drag-and-drop decision**: chose `@dnd-kit/sortable` over react-dnd
(modern, hooks-native, smaller bundle). Drag-to-reorder works on cards;
drag-from-palette-to-workspace was scoped out as a v2 nicety —
click-to-add is the primary motion.

**The 15 rule kinds** map the user's enumerated list:
- CRS (was "Coordinates & Geometry" / kept the CRS+vertical-datum
  fields here only)
- basepoint (split out — required + position tolerance + indicative
  address)
- control_point (split out — required + rotation tolerance + indicative
  address)
- site_plan, site_grid, canonical_floors (geometry continued)
- scopes, disciplines, parties (scope & org)
- classification (multi-system support), tagging (cross-system),
  mmi_lod, ifc_schema, custom_properties, naming (standards)

## Next

1. **`entity_ifc_type` field on `IFCType`** — backend migration +
   extractor update. Still queued from yesterday. Unblocks reliable
   class-level viewer filtering (TYPE-class vs ENTITY-class mismatch).
2. **EIR persistence** — wire the rule array to a backend
   `ProjectEirRule` model (Phase 7 BEP-backend restore territory).
3. **Map embed for basepoint/control-point picker** — Leaflet +
   Kartverket WMTS or OSM tile layer + draggable marker that updates
   the AddressValue's lat/lon and reverse-resolves a label via Geonorge.
4. **Quantities/Mengder under the Data tab** — user-flagged backlog
   item: new sidebar entry showing aggregated quantities per type /
   class / storey. Backend extraction via `IfcElementQuantity`. Out of
   scope this session.
5. **HQ vs Hjem dashboard naming** — user weighing rename of project
   dashboard. Quick rec went out (HQ over Hjem); not implemented.

## Notes

- Live verification each push: `https://www.sprucelab.io` 200,
  `https://sprucelab-production.up.railway.app/api/capabilities/` 200.
  Note that `api.sprucelab.io` resolves to a stale Vercel deployment
  returning `DEPLOYMENT_NOT_FOUND` — frontend doesn't actually use it
  (talks direct to `sprucelab-production.up.railway.app`), so cosmetic
  only, but worth cleaning up some day.
- The user's design-correction cadence again pointed at over-design:
  three takes on the EIR layout this session and yesterday. The final
  one (rule builder) is closer to a Linear-style policy editor than to
  a SaaS settings page. Lesson reinforced: when the user says "make it
  a config, not text" they mean *give me the policy editor*, not "add
  some form fields to the prose."
- Stale `.claude/worktrees/agent-*` cleanup still pending (24 dirs).
