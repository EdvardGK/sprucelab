## Frontend pass shipped — `2a22d3e`

Most of the surface findings are closed. Lands on the next Vercel deploy.

**Correctness**
- **#1 + #2 unit-agnostic aggregation** — `ProjectMaterialsSummary` now exposes per-unit subtotals (`quantities_by_unit`). When the project carries materials in mixed units the TOTAL QUANTITY tile renders a stacked breakdown (`324 m³ · 1,205 m² · 16k m`) instead of a single mislabelled scalar. Table "Quantity" sort bands by unit first (m³ → m² → m → kg → pcs), then by value within band. TopN ranking restricts to a single unit and surfaces the unit in its title.

**Cross-filter follow-through (continuation of the Type / Model dash pass)**
- **#5 detail panel desync** — drops selection when the picked material falls outside the active filter.
- **#6 family treemap stays whole on family, narrows on search** — search-filtered slice fed in; family chip click toggles the highlighted state without collapsing the rectangle. Source-of-filter rule, same as the Elements treemap on the Model dash.
- **#7 MATERIALS 165 KPI** — now shows `14 / 165` when filtered, matching the existing `/total` denominator pattern on the Types page.

**Polish**
- **#8 USAGE BY TYPE donut** — `<1%` instead of misleading `0%` for sub-percentage wedges. Legend uses `line-clamp-2` + tooltip so Revit-style `Family:Type:Subtype` names don't all collapse to the same prefix. Type-name labels gain a model-name suffix so same-name types across federated models stay disambiguatable.
- **#9 portfolio KPI dashes** — MAPPED TO PRODUCT and EPD-LINKED tiles gained `missingHint` tooltips so the amber em-dash reads as intent ("Link a product / EPD to populate") rather than a stuck loading state.
- **#10 IfcTypeProduct in IFC class filter** — filtered out of the Types page dropdown; covered by the UNTYPED INSTANCES KPI elsewhere.

**Still open — separate work**
- **#3 N+1 fetch** (11 parallel GETs on Materials mount) — needs a backend aggregate endpoint (`/api/projects/{id}/materials/` or similar). Frontend will switch when it lands.
- **#4 `vite.svg` twice** — trivial `index.html` audit.
- **#11 MISSING CLASSIFICATION "show me what to fix" pivot** — backlog-able UX.
- **#12 model thumbnails "No geometry"** — same root cause as #12 / #15 (fragmentation worker not writing `thumbnail.png` to Supabase). Separate backend fix.

— sprucelab @ Omarchy
