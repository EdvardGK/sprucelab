# Session: EIR builder polish + map/IFC preview panel + ISO 19650 framing

## Summary

Continuation of the 13:44 EIR-rule-builder session. Five commits between
`9a55262` and `2dc9ab0`, all landed on `main`, all verified 200 on
Vercel + Railway. Two themes: (1) the rule-builder is now a real
*builder*, not a form-strip — canvas-grid workspace, collapsible cards
with chip-line summaries, sortable across rows, live right-side preview
with Kartverket map + IFC-property tree; (2) deep architectural framing
captured for the next several sessions — ISO 19650 tier hierarchy
(OIR/AIR/PIR/EIR), role-based onboarding-issues, cached site
environment in the 3D viewer.

Why it matters: the user's "the project config is just bad UI" call
this session was correct — the workspace looked like form strips, not
a builder. The grid + collapse + summary + preview rework + form-UX
best practices push it into actual canvas territory. And the
architectural memory entries lock in three big directions before
they're forgotten.

## Changes

### `15e7c27` — feat(eir): structural fixes (mutual exclusivity, dbl-click+drag, IFC storage)
- Single click does nothing; double-click or drag-from-palette adds.
- `maxInstances` (default 1) caps most rules at singletons; three are
  unlimited: classification (per system), tagging (per namespace),
  custom_properties (per prefix).
- Merged basepoint + control_point into one `placement` rule. Basepoint
  E/N/H always required; control_point gated via `EirField.dependsOn`
  on an "Enable control point" toggle.
- Address search lives on `site_plan` only (no duplicate inputs).
- `site_grid` simplified to file-formats multiselect (DWG / IFC IfcGrid
  / CSV) — axes + spacing parsed from the uploaded file, not edited.
- `custom_properties` reframed: project/company-prefixed Psets, NOT
  `Pset_*Common`. Two fields: prefix + comma-separated Pset names.
  Full property-list builder is a follow-up.
- `classification`, `mmi_lod`, `tagging` declare `ifc_pset` +
  `ifc_property` fields — where in IFC the value lives. Tagging adds
  `syntax_regex` for value validation.

### `a1398dc` — feat(eir): Kartverket WMTS map embed (site_plan)
- New deps: `leaflet`, `proj4`, `proj4leaflet` + types.
- `KartverketMap.tsx` — proj4leaflet `L.Proj.CRS` configured with the
  UTM33N proj4 definition, Kartverket WMTS resolution ladder, and
  origin from GetCapabilities. Tile URL targets
  `cache.kartverket.no/v1/service` (Layer=topo, TileMatrixSet=utm33n).
- Inline below the address field on `site_plan` (later moved into the
  preview panel — see `2dc9ab0`).
- `invalidateSize()` after mount to handle the flex-parent 0×0 race.

### `19920f7` — feat(eir): per-scope canonical floors + scope coord modes
- `canonical_floors` gains `maxInstances: Infinity` + a `scope` text
  field. One rule per scope, or one project-wide (empty scope).
- `scopes` rule gains `allowed_coordinate_modes` multiselect:
  - `global` — IFC vertices in project CRS at world coords.
  - `local` — vertices offset so basepoint = origin; federation
    transform lifts back at viewer time. Avoids float precision loss.

### `2dc9ab0` — feat(eir): canvas-grid + collapsible + preview panel
The big UX rework. Three pieces:

**Canvas grid**: workspace switches from a single vertical column of
full-width strips to a CSS grid (`auto-fill, minmax(~20rem, 1fr)`).
2–3 cards per row on a 1440-laptop, 4+ on a 27". Sortable strategy
changed from `verticalListSortingStrategy` to `rectSortingStrategy` so
drag works across rows in a grid.

**Compact collapsible cards**:
- Header is clickable to collapse → chip-line summary appears in
  header below title.
- Drag handle on left edge (subtle until hover).
- X is hover-only — no accidental destructive clicks.
- Auto-collapse during drag (clean drag visual).
- `summarizeRule()` helper picks up to 3 non-empty field values per
  rule and formats with `·` separator.
- Field-row layout: toggles + numbers stay inline with their label
  (compact); selects/multiselects/addresses/text stack vertically with
  uppercase-tracked-small labels for the builder feel.

**Live preview panel** (3rd column, xl+ viewports only):
- Tab 1 (Map): KartverketMap refactored to accept
  `markers: MapMarker[]` (kind = `'site' | 'basepoint' | 'control'`),
  rendered as colored DivIcon dots with inline labels. Markers derived
  live from rule config:
  - Site address from `site_plan.address` (WGS84 direct).
  - Basepoint + control point from `placement.basepoint_*` and
    `placement.control_point_*` (project CRS, converted via proj4 from
    EPSG:25833 → EPSG:4326 for display).
- Tab 2 (IFC): stylized property-panel tree showing how the rules
  project into a sample IFC delivery:
  - `IfcProject` → name template, schema, MVD
  - `IfcProjectedCRS` → name + vertical datum
  - `IfcSite` → adressetekst, RefLatitude, RefLongitude
  - `IfcMapConversion` → Eastings, Northings, OrthogonalHeight
  - `IfcBuilding` → Pset.Property lines for every classification, MMI,
    tag, and custom Pset rule. Gaps shown in muted em-dash.
  - Foundation for a real 3D cube render later.

Inline map below the site_plan address field is removed — preview
panel owns it now, no duplicate displays.

## Technical details

**Why we lifted Kartverket WMTS instead of OSM raster**: the user
explicitly ordered (3) Kartverket → (2) vector OSM → (1) reprojected
raster OSM. Kartverket publishes tiles natively in EUREF89/NTM and
UTM zones — no Web Mercator distortion, official Norwegian basemap,
free, exactly what BIM coordinates already speak. proj4leaflet's
`L.Proj.CRS` accepts the proj4 def + Kartverket's published tile-matrix
resolutions + origin from GetCapabilities; everything else is standard
Leaflet.

**proj4 conversion for basepoint marker placement**: basepoint values
are typed in project CRS (default UTM33N today; per-project later when
BEP CRS picker lands). Markers go on the map in WGS84 lat/lon
(proj4leaflet projects back to UTM33N for display). So we
`proj4('EPSG:25833', 'EPSG:4326', [e, n])` once per render in
EirPreviewPanel.tsx's `projectCrsToWgs84()`. Returns null on
NaN/zero/out-of-range so the marker disappears cleanly when fields
are empty.

**Mutual exclusivity via `maxInstances` (default 1)**: simpler than
heuristic detection. Three rules explicitly `Infinity`:
- `classification` (one per system: NS3451 + OmniClass + …)
- `tagging` (one per namespace: discipline + stage + asset_id + …)
- `custom_properties` (one per project/company-prefix)

The palette's CountBadge shows `{count}/{max}` for finite caps,
`{count}` for infinity, dim when at cap.

**`EirField.dependsOn`** is the conditional-rendering primitive.
`EirConfigurator` skips a field whose `dependsOn.fieldId` value doesn't
equal `dependsOn.equals`. Used by placement to hide control-point
fields when the "Enable control point" toggle is off.

**Form-builder UX patterns applied**:
- Collapse + summary (Linear / Notion property editor)
- Compact rows w/ hover-only destructive actions
- Stacked-label style for wide controls (Webflow / Zapier)
- Inline-label style for narrow controls (toggles, numbers)
- Subtle card shadow + hover lift (objects-on-a-canvas feel)

## Memory entries written

Five new memory entries this session lock in framing that will shape
several future sessions:

1. **`site-environment-architecture.md`** — cached Kartverket tile +
   extruded OSM building footprints (lifted from skiplumXge-react) as
   a localized site environment beneath the federated models in the 3D
   viewer. Set-once + lazy overnight refresh, not live. Scope
   coordinate mode (global vs local) shifts the tile placement.

2. **`eir-bep-four-surfaces.md`** — Project Config is two routes (`/eir`
   and `/bep`), with builder-vs-viewer emerging from permissions plus
   an explicit `?mode=view`/`?mode=edit` toggle. Reader and editor see
   the same layout; affordances (palette, drag, X) hide based on
   access. Do NOT build four separate routes.

3. **`iso19650-tiers-and-role-onboarding.md`** — reframe the rule
   builder against ISO 19650's full hierarchy (OIR / AIR / PIR / EIR +
   BEP) with inheritance. Each rule + each BEP slot has a
   `responsibleRole`. On `project_member.joined`, generate
   `Claim(kind='onboarding_fillin')` for every unanswered rule/slot in
   that role's scope. Inbox view = "things only you can answer."
   Reuses existing Claim system — no new inbox infra.

Plus updates to `feedback-config-is-eir-bep-status-triad.md` (banner
noting the 3-column layout was rejected; conceptual triad still valid)
and the MEMORY.md index.

## Next

1. **Access-gated `?mode=view` / `?mode=edit` toggle on EIR builder**.
   Pattern is locked in (`eir-bep-four-surfaces.md`); needs auth/role
   context wired into ProjectSettingsPage + the affordance gates
   (hide palette, drag handles, X, swap inputs to read-only renderers).
2. **ISO 19650 tier filter in palette**. Add `tier: 'oir' | 'air' |
   'pir' | 'eir'` + `responsibleRole` to `EirRuleDefinition`. Palette
   gets a segmented control at the top. Single-tab default = EIR
   (today's behavior); switch to other tiers reveals their rules. See
   `iso19650-tiers-and-role-onboarding.md`.
3. **BEP-builder route** at `/projects/:id/bep`. Needs Phase 7
   BEP-backend restore from `archive/` for persistence — see
   `bep-eir-archive-restore-plan.md`.
4. **IFC 3D cube** in the preview panel's IFC tab. Replace the
   property-panel-only tree with a small ThatOpen/threejs cube +
   anchored labels per Pset. Visual companion to the existing
   tree view.
5. **Address search backend proxy + tile cache**. Today the Geonorge +
   Kartverket calls hit upstream directly from the browser. Move both
   behind Django (rate-limit, cache, lazy overnight refresh per
   `site-environment-architecture.md`).
6. **Role-based onboarding-issue dispatcher**. New
   `apps/automation/onboarding_issues.py` reading unanswered rules/slots
   per role on `project_member.joined`. Generates Claims with kind
   `onboarding_fillin`. Auto-resolve on fill.
7. **3D site environment** in UnifiedBIMViewer — cached Kartverket
   ground tile + extruded OSM Overpass footprints as context massings
   beneath the federated IFC models. Two or three PRs.
8. **`entity_ifc_type` field on `IFCType`** (carried from earlier
   sessions) — backend migration + extractor update. Unblocks
   reliable class-level viewer filtering.

## Notes

- Live verification each push: `https://www.sprucelab.io` 200,
  `https://sprucelab-production.up.railway.app/api/capabilities/` 200.
- The user's design-correction cadence stayed high but converged
  productively this session. Final builder UX is much closer to what
  they were asking for — Linear/Notion/Webflow-style canvas, not a SaaS
  settings form.
- Per-card collapse + the chip-line summary deserve a follow-up: the
  summary text is currently generic via `summarizeRule()`. Some rules
  (placement, site_plan with address) would benefit from custom
  summarizers — e.g., "Building basepoint at E 604832, N 6643211 ·
  ±0.10m" reads better than the generic field-by-field walk.
- Stale `.claude/worktrees/agent-*` cleanup still pending (24 dirs).
- The "ISO 19650 tier reframe" plus the "role-issues-on-join" plus the
  "site environment in viewer" are three large multi-PR roadmap items
  that came out of this session. The memory entries are the durable
  artifact — the code is downstream.
