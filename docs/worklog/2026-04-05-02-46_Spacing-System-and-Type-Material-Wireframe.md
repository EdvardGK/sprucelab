# Session: Spacing System Propagation + Type Material Recipe UX

## Summary
Propagated the spacing CSS variable system (`--space-xs` through `--space-2xl`) from wireframe 02 to all 10 remaining wireframes — 230 clean variable references replacing hardcoded px values. Then redesigned the material layers table in the Type Browser wireframe (02) to express materials as **quantity per type unit** with EPD-driven units, aligning with the real Reduzer/LCA workflow documented in `~/skiplum/client-projects/10027-grønland-55/magna-reduzer/docs/reduzer-workflow.md`. Started but did not complete a bento grid redesign of the Model Workspace overview tab (05).

## Changes
- **All wireframes (00-10)**: Injected spacing CSS variables into `:root`. Replaced ~230 hardcoded padding/margin/gap px values with `var(--space-*)` references. Fixed 117 false positives where non-spacing properties (border-radius, font-size, width/height) were incorrectly replaced.
- **02-type-browser.html**: Rewrote material layers table:
  - Column headers: `#`, `Materiale / EPD`, `Mengde`, `Enhet`
  - Each row shows material name + EPD reference (NEPD number) + editable quantity + unit
  - **EPD drives the unit**: when EPD is linked, unit is a static label derived from EPD's declared unit (e.g., "krever kg"). When no EPD, unit is a dashed-border manual label.
  - Realistic example data: kledning 14.5 kg/m², mineralull 0.20 m³/m², stenderverk 3.5 m/m² (no EPD), gipsplate 18.0 kg/m²
  - Section label: "Materialoppskrift per m²" (adapts to type's representative unit)
  - Button text changed from "Legg til sjikt" to "Legg til materiale"
- **05-model-workspace.html**: Began CSS rewrite for bento grid overview — replaced KPI row/two-col CSS with dense 12-column grid layout, model identity card, treemap, quality checklist, storey chart, type progress, and version timeline CSS classes. **HTML body NOT yet updated** — still references old structure.

## Technical Details
- Spacing propagation done via Python script (`/tmp/propagate-spacing.py`) for efficiency. First pass was too aggressive (line-based replacement caught non-spacing properties on lines that also had padding/margin). Second script (`/tmp/fix-spacing.py`) used property-level regex to revert 117 bad replacements.
- Reviewed `reduzer-workflow.md` which documents the full Reduzer component pipeline — key insight: EPD declares its functional unit (m³, kg, m²), and `qty_per_unit` must be expressed in that unit. The material unit is NOT a free choice.
- `TypeDefinitionLayer` model already has `quantity_per_unit` + `material_unit` fields — backend aligns with wireframe changes.

## Next
- **FINISH wireframe 05 Overview tab HTML** — CSS is ready (bento grid with 12-col layout), but HTML body still has old KPI cards + two-column structure. Need to write the bento grid HTML with: model identity card, treemap (CSS grid rectangles), quality checklist, storey chart, type progress stacked bar, and compact version timeline.
- Review all wireframes in browser with user
- Rebuild CheckItemCard.tsx and ProjectField.tsx with shadcn

## Notes
- The material recipe table design now directly mirrors the Reduzer import template structure (component → material → EPD → qty_per_unit → unit). This means the type classification workflow in Sprucelab can produce Reduzer-ready export data.
- Wireframe 05 is in a partially broken state — new CSS classes defined but HTML still uses old structure. Not a code issue (it's a wireframe), just won't render the overview tab correctly until HTML is updated.
