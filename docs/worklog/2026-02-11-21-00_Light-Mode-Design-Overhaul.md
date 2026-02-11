# Session: Light Mode Design Overhaul - Basecamp/Hey Style

## Summary
Researched and implemented a design system overhaul from dark-mode-first (Linear/Supabase style) to light-mode-first with warm, opinionated colors inspired by Basecamp/Hey and Airtable. The goal is to make the platform more approachable for non-technical BIM professionals.

## Research Completed
- Jason Fried's product design philosophy: opinionated, don't water down vision
- Linear design critique: dark mode leads to "monotonous" products
- Color psychology: warm colors = approachable, 90% of user judgment based on color
- Gamification best practices: start simple, tie to real value
- UI/UX pitfalls: style over substance, cluttered interfaces, chasing trends

## Changes Made

### Core Theme (`globals.css`)
- Swapped `:root` (light) and `.dark` (dark) CSS variables
- Light mode now uses warm off-whites (#FAFAF9) instead of sterile white
- Text uses warm near-black (#1C1917) instead of cold gray
- Primary color: warm blue (#4A90D9)
- Added amber accent (#F59E0B) - Hey-inspired
- Added status color variables (success, warning, info)

### Design Tokens (`design-tokens.ts`)
- Updated header comments to reflect new philosophy
- Border colors: warm stone instead of cold zinc
- Text colors: warm grays for light mode readability

### Tailwind Config
- Added `surface` color for hover states

### Data Grid (`data-grid.css`)
- Updated to warm palette (stone-50, stone-100, stone-200)
- Hover states use warm amber tint
- Selection uses warm blue tint

## Files Modified
- `frontend/src/styles/globals.css`
- `frontend/src/lib/design-tokens.ts`
- `frontend/tailwind.config.ts`
- `frontend/src/components/ui/data-grid/data-grid.css`

## Plan Document
Full research and implementation plan saved at:
`~/.claude/plans/declarative-sniffing-toucan.md`

## Next Steps
1. Test all pages visually in light mode
2. Verify WCAG AA contrast ratios
3. Add theme toggle component (optional)
4. Phase 2: Add gamification components (ProgressRing, HealthBadge)

## Design Manifesto (from plan)
1. Warm over cold - paper-like whites, stone grays
2. Personality over neutrality - colors that say something
3. Progress is satisfying - gamification rewards completion
4. Status at a glance - colorful Airtable-style badges
5. Light by default - non-programmers expect light mode
6. Bold but accessible - WCAG compliant
7. Opinionated - pick choices and commit
