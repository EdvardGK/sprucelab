# Session: Design System Token Overhaul

## Summary
Overhauled the Sprucelab design system tokens. Expanded `:root` from 63 to 89 CSS variables, eliminated 121 of 191 hardcoded hex values across all 14 HTML files (design system + 12 wireframes + master index). Discipline colors (ARK/RIB/RIV/RIE) were re-derived from the core palette (Lavender/Lime/Forest/Navy) instead of using external Tailwind colors. Session ended with research into whether traffic light colors should also be palette-derived — concluded they should stay standard (green/yellow/red), but chart/tag orphan colors (indigo, blue) should be eliminated in favor of palette reuse.

## Changes
- `docs/design-system.html` — Expanded `:root` with 26 new tokens (surfaces, borders, shadows, focus, charts, tags, viewer, interaction states). Added 4 new documentation sections (Surfaces & Borders, Shadows & Focus, Charts & Tags, Viewer). Updated discipline colors from Tailwind to palette-derived. Updated gradient swatches to use `var()`.
- All 13 wireframe files — Replaced `:root` block with new canonical version. Replaced hardcoded hex values with `var()` references in CSS rules and inline styles.
- Discipline color change: ARK=#f3f5fa/#4a5280 (Lavender), RIB=#f7f8e4/#5a5c15 (Lime), RIV=#e8f2ee/#157954 (Forest), RIE=#e9e9eb/#21263A (Navy)

## Technical Details
- Wrote a Python script for bulk replacement across all 14 files: replaces `:root` block, then applies CSS rule replacements (outside `:root`), then inline style replacements (in HTML body). This was far more reliable than manual editing.
- Remaining 70 hardcoded hex values are all legitimate: documentation labels (38), SVG XML attributes that can't use `var()` (9), one-off visualization colors like treemap shades (21), CSS fallback values (2).
- Researched design system color best practices across GitHub Primer (8 families), Vercel (2+3), Linear (mono+accent), Atlassian (10), Stripe (brand+status). Key finding: traffic lights stay standard universally; brand palette is 1-3 hues; 5-8 total families is the sweet spot.

## Next
- Eliminate `--chart-indigo` (#6366f1) and `--chart-blue` (#3b82f6) — these are orphan hues not from the palette. Replace with palette colors (lavender-derived? navy? text-secondary?). Same for `--tag-blue` — replace with lavender-derived pair.
- This would reduce hue families from 10 to 7-8, matching best practice.
- After color cleanup: review wireframes in browser to validate visual output
- Then: propagate design tokens to React frontend (`globals.css`, `design-tokens.ts`, `tailwind.config.ts`)

## Notes
- Traffic light colors (green/yellow/red) should NOT be derived from palette — universal recognition trumps palette coherence. Every major design system (Primer, Vercel, Linear, Stripe) keeps them standard.
- The real color bloat is in chart/tag tokens that introduce blue and indigo hues with no palette parent.
- `--surface-muted` and `--tl-gray-bg` share the same value (#f1f5f9) intentionally — different semantic purpose allows them to diverge later if needed.
