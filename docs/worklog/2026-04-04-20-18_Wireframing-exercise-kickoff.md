# Session: Sprucelab Wireframing Exercise Kickoff

## Summary
Kicked off a comprehensive wireframing exercise for Sprucelab — stepping back from 126 built components to properly design the UX before building more. Created a detailed plan (11 page wireframes + layout variants for dashboard and work UIs) and built the first two wireframes: Projects Gallery (00) and Project Dashboard (01). Key design decisions made: requirement counts replace abstract health scores, traffic light/matrix patterns from the Palehaven report adopted as the visual language.

## Changes
- `docs/wireframes/00-projects-gallery.html` — Projects Gallery with global sidebar, 6 project cards, requirement progress bars ("12/17 krav"), discipline tags, create project dialog
- `docs/wireframes/01-project-dashboard.html` — Project Dashboard with project sidebar, 3 tabs (Oversikt/Samsvar/Modeller), bento grid layout, traffic light requirement list, model x requirement compliance matrix, storey coordination matrix, classification progress per discipline
- Plan file at `~/.claude/plans/cozy-finding-kernighan.md`

## Technical Details
- Self-contained HTML files with inline CSS/JS, only external dependency is Inter font from Google Fonts
- Color system faithfully pulled from `frontend/src/styles/globals.css` — forest green primary (#157954), lime accent (#D0D34D), navy text (#21263A), glassmorphism sidebar
- Sidebar structure matches `frontend/src/components/Layout/Sidebar.tsx` exactly — two variants (global vs project)
- Traffic light system adopted from Palehaven dashboard (`~/skiplum/client-projects/10011-palehaven/.../dashboard.html`): green/yellow/red/gray with background + text color pairs
- Requirement-based progress instead of abstract health scores — user explicitly chose "1 requirement = 1 point" transparency

## Next
- Build wireframe 02 (Type Browser) — most complex, 3-column layout with list/grid toggle. Core work UI.
- Build wireframe 03 (3D Viewer) — unique 3-zone layout
- Build wireframes 04-10 (Models, Workspace, BEP, Field, Spaces (greenfield), QTO, My Page)
- Build dashboard layout variants (3-4 bento-box explorations)
- Build type classification work UI variants (3-4 layouts)
- Build verification/QA work UI variants (3-4 layouts)
- Build master document (sprucelab-wireframes.html)
- 13 tasks remaining out of 15 total

## Notes
- User wants "simple forms and dropdowns, visually pleasing but most of all intuitive and on point"
- User emphasized putting yourself in the user's shoes: "what would you need to perform your work fast and without looking for info"
- User said "traffic lights, cards, and matrices" — this is the core visual vocabulary
- The Palehaven multi-model dashboard report is the reference for the dashboard patterns
- Desktop-first (1440-1920px), NOT mobile
- Light mode only
- Spaces page is greenfield (no existing code) — highest design value
- All Norwegian UI labels, English code comments
