# Frontend design guide

Single source of truth for layout, sizing, density, and component
conventions. Supersedes the "Frontend Rules" section of `CLAUDE.md`
(which now points here).

The reference implementation we steal patterns from is
`~/workspace/skiplum/dev/skiplumXge-react` — the data-UI we're
modeling. When in doubt, look there first; lift, don't reinvent.

---

## Layout philosophy

**Grid-first inside dashboards. Flow elsewhere.**

A page has two kinds of regions:

1. **Dashboard region** — a fixed-extent viewport (project dashboard,
   model workspace, type viewer dash). Sizing comes from the grid;
   tiles fill cells; internal scroll lives inside the tile, not the
   page. Use `<DashboardGrid>` + `<DashboardTile>`.
2. **Flow region** — long lists, settings pages, document libraries.
   Content flows top-to-bottom, page scrolls. No grid, no fixed
   heights.

Each page picks one mode. Don't mix grid + flow vertically on the
same page — that's where "wide cards on wide monitors" comes from.

---

## DashboardGrid + DashboardTile

`frontend/src/components/Layout/DashboardGrid.tsx`,
`frontend/src/components/Layout/DashboardTile.tsx`. Demo at
`/dev/grid-demo`.

Define the layout as a string-array, name each cell, span by
repetition:

```tsx
const layout = {
  rows: 3, cols: 4,
  layout: [
    ['kpi-a', 'kpi-b', 'kpi-c', 'kpi-d'],
    ['chart',  'chart',  'side',  'side' ],
    ['table',  'table',  'table', 'detail'],
  ],
};

<DashboardGrid layout={layout}>
  <DashboardTile id="kpi-a">…</DashboardTile>
  <DashboardTile id="chart">…</DashboardTile>
  …
</DashboardGrid>
```

**Breakpoints (built into `DashboardGrid`)**:

| Width             | Behavior                          |
|-------------------|-----------------------------------|
| `≥ 1024px`        | 4-column grid, named-cell layout  |
| `768–1023px`      | 2-column grid, layout flattens    |
| `< 768px`         | Single-column stack, source order |

**Tile rules**:

- Always fills its cell (`h-full w-full`, `overflow-hidden` enforced).
- Internal overflow handled inside the tile body (`overflow-y-auto`
  on the scrollable child, not the tile root).
- Don't set fixed heights on tiles. Don't set `min-h` unless the
  whole grid needs to grow.

**Variants**: `default`, `highlight` (primary ring), `accent`
(accent ring). Use `highlight` sparingly to draw the eye to one
"hero" cell; never to mark "selected" — that's interaction state
(use border/background change inside the tile body).

---

## Flow regions

For lists, settings, document libraries:

- **No max-width caps.** Don't use `max-w-7xl mx-auto`. Content
  fills the available width.
- **No viewport locking.** Don't combine `h-[calc(100vh-X)]` with
  `overflow-hidden`. Pages scroll naturally.
- **No fixed-pixel card heights** outside of dashboard tiles.
  Cards size to their content.

---

## Sizing primitives

**Use `clamp()` for type, icons, padding, gaps.** Locks proportions
across monitor sizes without hand-tuning per breakpoint.

| Role        | Class                                                  |
|-------------|--------------------------------------------------------|
| Heading     | `text-[clamp(1rem,3vw,1.5rem)]`                        |
| Body        | `text-[clamp(0.625rem,1.2vw,0.75rem)]`                 |
| Small       | `text-[clamp(0.5rem,1vw,0.625rem)]`                    |
| Icon        | `h-[clamp(1rem,2vw,1.25rem)] w-[…]`                    |
| Padding/gap | `p-[clamp(0.5rem,1.5vw,1rem)]`                         |
| Metric      | `text-[clamp(1.5rem,4vw,2rem)]`                        |

Don't override mid-stream. If you need a different scale, define a
new role and use it consistently across the page.

---

## Density

Pick one density per region:

- **Comfortable** — default for pages with text + KPIs. `gap-3`,
  `p-4`, body type.
- **Dense** — for tabular data and reference views. `gap-2`,
  `p-3`, small type.

Don't mix densities across tiles in the same DashboardGrid.

---

## Component sourcing

Order of preference when adding UI:

1. **`@/components/Layout/*`** — DashboardGrid, DashboardTile,
   AppLayout, AppHeader, Sidebar.
2. **`@/components/ui/*`** — shadcn primitives. The Card here is
   what DashboardTile wraps. Use it directly only outside dashboard
   regions.
3. **`@/components/features/*`** — domain components (warehouse,
   viewer, field, etc.). Build new feature components on top of
   layout + ui primitives, not raw Tailwind.
4. **Lift from `~/workspace/skiplum/dev/skiplumXge-react`** before
   inventing. Note the source in a comment when you do.

---

## Internationalization

**All user-facing text uses `useTranslation()`.** No hardcoded
strings. Backend returns translation keys, not translated strings.

- Locale files: `frontend/src/i18n/locales/{en,nb}.json`.
- Add keys to BOTH files.
- Use nested keys: `"section.subsection.key"`.

---

## Role-gated features

Some features are role-scoped (Claims is leaders/coordinators-only,
not a general view). Until project-membership roles exist on the
backend, gate on the staff/superuser flag:

```tsx
const { user } = useAuth();
if (!user?.is_staff) return null;
```

Where to put the gate:

- **Nav item** — hide the link in the sidebar/tab bar, not the page
  itself, so users don't see a tease they can't reach.
- **Page route** — also gate the route element so a deep-link 404s
  rather than rendering empty state.
- **Inline action** — for staff-only buttons inside an otherwise
  shared page, hide the button; don't disable.

---

## Forward-deployed embed surface

The same primitives back the embed dashboards in
`frontend/src/pages/EmbedDashboard.tsx` and (eventually) the
skiplum-pages embeds. Don't create embed-only layout primitives —
use `DashboardGrid` + `DashboardTile`. The embed-specific concerns
(token, postMessage, isolation) live in `frontend/src/lib/embed/`.

---

## When in doubt

1. **Resize the browser window** before opening a PR. If something
   breaks between 768 / 1024 / 1440, fix it before review.
2. **Check `/dev/grid-demo`** — it's the canonical eyeball test.
3. **Steal from skiplumXge-react.** Their grid + dashboard pattern
   is the target. Lift first; adapt second; invent only when neither
   works.
