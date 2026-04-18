# Mobile Companion Strategy

**Status:** Notes only — no implementation work scheduled
**Branch:** `claude/responsive-design-mobile-2ZpGV`
**Context:** Desktop (engineers, architects, PMs on monitors) is and remains primary. Mobile is a distant secondary priority, but worth capturing the strategy while it's fresh.

---

## Product Framing

Mobile Sprucelab is a **tactical companion app**, not a shrunken workspace.

**Use cases:**
- Pre-meeting and in-meeting referencing ("where does Block A stand?")
- Passing on / delegating tasks or data points
- Quick glance at project health, changes since last upload
- Triage: approve, flag, assign — not author

**Explicitly not for mobile:**
- 3D viewer
- Excel import/export
- Type classification grid (dense data entry)
- Verification rule builder
- Sandwich view editor

These get a friendly "best on desktop" card below the `md:` breakpoint.

---

## Reference Apps

**Linear mobile** and **GitHub mobile** solved the same problem (developer tool, desktop-primary, mobile-companion). Patterns to steal:

### Shared patterns
1. **Inbox/notifications is the home tab**, not a dashboard
2. **Lists > grids** — vertical scroll, one thing per row, dense but readable
3. **Actions via swipe or bottom sheets**, never modals
4. **Detail views are deep and readable**, not editable
5. **5 bottom tabs max**

### Linear specifics
- Inbox-first — opens to notifications/mentions
- Dense scannable rows (status, assignee, priority as icons + color)
- Swipe-right to assign, swipe-left to snooze/archive
- Command menu as a bottom sheet
- Zero chrome, back gesture + bottom tabs
- Optimistic updates — never a blocking spinner

### GitHub specifics
- Read-optimized (diffs, PRs, conversations)
- Notifications as home screen
- Rich previews — tap notification, land on exact comment/diff
- Merge/approve/comment are one-tap
- Syntax highlighting + horizontal scroll for code (no reflow)

---

## Proposed Sprucelab Mobile Shape

**Bottom tabs:**
1. **Inbox** — mentions, assigned action items, new uploads, verification failures on your projects
2. **Projects** — your project list → drill into health card
3. **Search** — jump to any type/model/project
4. **You** — assigned action items, recent activity

**High-value screens:**
- **Project health at a glance** — health score, # unverified types, last upload, action-item count
- **Action items / verification issues** — swipeable list, tap for detail, swipe-right to assign/flag
- **Type/model summary card** — shareable as link or screenshot ("Block A, 357 types, 82% classified, 3 critical issues")
- **Change detection feed** — scrollable timeline of what changed since last upload
- **Notifications / mentions**

**Share/delegate primitives:**
- Deep links to any type/issue/model (opens on desktop for recipient)
- "Copy summary" → clipboard with numbers + link for Teams/Slack paste
- Assign-to-person on action items

---

## Mobile Best Practices (Checklist for When Work Starts)

General lessons from a decade+ of mobile UX:

1. **Thumb zones** — primary actions bottom-right or bottom-center; bottom tab bars over top nav
2. **Progressive disclosure** — hide and reveal, don't shrink
3. **Perceived performance** — skeleton screens, optimistic UI, <100ms tap feedback
4. **Gestures as language** — swipe to dismiss, pull to refresh, long-press for context (no invented gestures)
5. **Forms** — `inputmode`, `autocomplete`, correct keyboard types, labels above fields, 16px min font (prevents iOS zoom), single column
6. **Safe areas** — `env(safe-area-inset-*)` for notches and home indicator
7. **No `:hover`-only interactions** — tooltips need a tap alternative
8. **Respect system settings** — `prefers-color-scheme`, `prefers-reduced-motion`
9. **One-handed reachability** — critical actions never top-right
10. **Test at 320px, 768px, 1280px**

---

## Technical Approach (When Work Starts)

- **Mobile-first CSS**, with `md:` / `lg:` restoring current desktop layout (additive, not rewriting)
- **Container queries** (`@container`, Tailwind v4) over media queries where possible
- **Fluid grids** — `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` for card lists
- **Structural breakpoints only** — sidebar → drawer, nav → hamburger, table → cards
- **Dashboard rule relaxation** — the `h-[calc(100vh-X)]` + `overflow-hidden` convention in CLAUDE.md was reversed; content-first scrolling is fine, which also unlocks mobile
- **Screenshot regression safety** — capture desktop at 1440px and 1920px before/after to catch leaks from mobile styles
- **shadcn/ui primitives** — `Sheet`, `Drawer`, `Tabs` for the mobile-specific pivots

---

## Scope Posture

Not on the top 10 right now. This doc exists so when mobile moves up the list, we start from a clear product position (companion, not workspace) rather than re-litigating it.
