# Session: Design System Setup and Wireframe Token Unification

## Summary
Created a standalone HTML design manual (`docs/design-system.html`) documenting all visual tokens — palette, typography, spacing, components, effects, and rules. Then unified all 12 wireframe files to use an identical canonical `:root` token block, replacing 134 hardcoded values with CSS variable references. Also created a type browser wireframe variant with the 3D viewer in the center column.

## Changes
- **Created `docs/design-system.html`** — self-contained visual reference page showing all design tokens with live examples: palette swatches, traffic light system, mapping status, discipline tags, typography hierarchy (7 roles), spacing scale with Tailwind mapping, buttons (3 variants), cards (4 types), pills/badges/tags, form inputs, nav items, progress bars, effects (glass, hover, focus, accent bar), and Do/Don't rules
- **Added radius scale** to design system: `--radius-sm: 6px` (buttons/badges), `--radius-md: 8px` (inputs/dialogs), `--radius: 12px` (cards/panels) — previously only had `--radius: 0.75rem`
- **Propagated canonical `:root` block** to all 12 wireframes (00-10 + master index) — every file now has identical token definitions including: 5 named palette colors, semantic colors, glass tokens, radius scale, spacing system, traffic lights, mapping status, discipline colors, gradients
- **Replaced 134 hardcoded values** across all wireframes: 87x `border-radius: 6px` → `var(--radius-sm)`, 12x `8px` → `var(--radius-md)`, 1x `7px` outlier fixed, 5x `gap: 20px` → `var(--card-gap)`, 29x hardcoded discipline hex colors → `var(--disc-*-bg/text)`
- **Created `docs/wireframes/02b-type-browser-viewer-center.html`** — variant layout with 3D viewer as the dominant center column (`2.4fr`), info panel + classification form moved to right column (`1.6fr`)

## Technical Details
- Used a Python script to regex-match and replace `:root { ... }` blocks across all 12 files atomically, ensuring byte-identical token blocks
- Second Python script handled the hardcoded value replacements (border-radius, gap, discipline colors) with string replacement — verified zero remaining violations afterward
- The `--tl-*` (traffic lights) and `--st-*` (mapping status) naming conventions are kept as separate token groups despite overlapping values — they serve different semantic purposes (validation vs classification)
- `border-radius: 4px` on pills/tags and `3px` on scrollbar thumbs left intentionally — they're cosmetic, not part of the component radius system

## Next
- Review both wireframe variants in browser (02 original vs 02b viewer-center) — decide on preferred layout
- Decide whether to adopt the 02b layout as the canonical type browser wireframe
- Consider propagating design system tokens to the actual React frontend (`globals.css`, `design-tokens.ts`, `tailwind.config.ts`) — the wireframes now define the canonical token set that the coded UI should match
- Rebuild Field module components (CheckItemCard, ProjectField) using the design system tokens
- Phase out Tremor dependency in MMI/QTO dashboards during their rebuild sprint

## Notes
- The design system HTML is a living reference — open it in browser alongside wireframes to compare
- Wireframes are work in progress (user noted this) — the design system establishes the rules, wireframes are the exploration space
- `border-radius: 4px` is used on small decorative elements (pills, progress bar fills, dots) — intentionally not variablized since they don't need the same design-system-level control
