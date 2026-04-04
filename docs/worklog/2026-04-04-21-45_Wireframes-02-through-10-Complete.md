# Session: Wireframes 02-10 + Master Document Complete

## Summary
Completed the entire wireframing exercise — built all remaining 9 wireframes (02-10) plus the master index document, bringing the total to 12 HTML files. This gives Sprucelab a complete UX reference for every major screen before building more React components. Also began establishing a uniform spacing system after user feedback about the 3D tile in the Type Browser being too cramped.

## Changes
- `docs/wireframes/02-type-browser.html` — 3-column layout (type list / classification form / info+3D panel), list+grid toggle, filter bar, grouped types with expand/collapse, keyboard shortcuts (A/F/I), NS3451 cascading selector, material layers table, fullscreen viewer overlay. Fixed spacing: added CSS variable spacing system, widened right column, added padding/border-radius to 3D canvas.
- `docs/wireframes/03-3d-viewer.html` — 3-zone layout: model tree (260px) with spatial hierarchy, dark 3D canvas with toolbar (select/section/measure/perspective/wireframe/x-ray), properties panel (300px) with Pset groups and element info
- `docs/wireframes/04-project-models.html` — Card gallery + table toggle, model cards with stats (types/elements/mapped%/filesize), processing state animation, upload dialog with new/version radio options
- `docs/wireframes/05-model-workspace.html` — Tabbed single-model view (Oversikt/Validering/Metadata), CSS bar chart for types per IFC class, version history timeline, validation rule results table with traffic lights, metadata with spatial structure tree
- `docs/wireframes/06-bep-eir.html` — Sub-sidebar (200px) with 5 config sections, BEP konfigurasjon content with project info, discipline overview table, delivery schedule with status badges
- `docs/wireframes/07-field-compliance.html` — Master-detail checklist layout, segmented progress bars (OK/Avvik/Gjenstår), 8 check items with status icons, deviation card with severity/assignee/deadline
- `docs/wireframes/08-spaces.html` — GREENFIELD design. Spatial hierarchy tree (300px) + room detail. Quick stats (area/volume/perimeter/storey), property table, bounding elements table, zone tags
- `docs/wireframes/09-qto.html` — 4 KPI cards, tabbed charts (CSS bar chart + CSS conic-gradient donut), data table with totals, export dropdown
- `docs/wireframes/10-my-page.html` — Global sidebar variant, 2-column dashboard: projects with progress, tasks with priority dots, activity timeline feed, quick stats grid
- `docs/wireframes/sprucelab-wireframes.html` — Master index with 3-column card grid linking to all 11 wireframes
- Plan file: `~/.claude/plans/cozy-finding-kernighan.md` (unchanged, all tasks now complete)

## Technical Details
- All wireframes are self-contained HTML with inline CSS/JS, only external dependency is Inter font from Google Fonts
- Design system faithfully matches `frontend/src/styles/globals.css` — forest green primary (#157954), lime accent (#D0D34D), navy text, glassmorphism sidebar
- Two sidebar variants used: Global (10-my-page, 00-projects-gallery) and Project (all others)
- Cross-linking between wireframes via relative hrefs on sidebar nav items
- Began spacing system in 02-type-browser.html: `--space-xs` (4px) through `--space-2xl` (40px), plus `--panel-pad` (16px) and `--card-gap` (16px)
- User flagged that 3D tile in type browser was squished — fixed by widening grid column proportions and adding padding/border-radius to viewer panel

## Next
- **Propagate spacing system** across all 11 wireframes for uniform margins/padding/gaps
- **Review all wireframes in browser** — user hasn't seen 02-10 yet, may have layout feedback
- Open question: user wants "uniform system for margins, component sizing/grids/cards" — could formalize as a design tokens reference document
- After wireframes are finalized: use them to guide frontend component rebuilds (field module, dashboard enhancements)
- Pending from before wireframing: CheckItemCard.tsx and ProjectField.tsx shadcn rebuild

## Notes
- 08-spaces.html is greenfield — no existing component, highest design value
- User feedback pattern: "simple forms and dropdowns, visually pleasing but most of all intuitive and on point"
- Visual vocabulary established: traffic lights, cards, matrices, segmented progress bars
- All Norwegian UI labels, English code comments
- Desktop-first (1440-1920px), light mode only
