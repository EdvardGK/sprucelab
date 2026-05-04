# dashboard-primitives

Domain-specific primitives for dashboard tile composition. Sibling to
`../ui/`, not a replacement.

## What belongs here

- Tile-level building blocks specific to sprucelab dashboards:
  `MetricCard`, `CoverageBar`, `TrafficLightBadge`, `DisciplineRow`,
  `Sidebar.NavSection`.
- Components that compose `../ui/` shadcn primitives plus sprucelab
  tokens (discipline colours, traffic-light tints from
  `lib/discipline-tokens.ts`).
- Reusable across routes (`/projects/<id>/`, `/projects/<id>/types`,
  embed iframes) — never route-bound.

## What does NOT belong here

- Generic Radix-shaped primitives — those go in `../ui/` and stay
  shadcn-CLI-generated.
- Domain widgets coupled to a specific feature (e.g. warehouse-only
  type browser tile shape) — those live under `../features/`.
- Tiles that read from `DashboardFilterProvider` and project filtered
  data — those will live under `../features/dashboards/tiles/` (PR #6
  scaffolding).

## Composition rules

1. Compose `../ui/` rather than fork. `MetricCard` wraps `Card` from
   `ui/card.tsx`; do not duplicate the glassy-bg styling.
2. Translate strings via `react-i18next`. Props that render text take
   `*Key` suffixes (`labelKey`, `helperKey`) so callers pass i18n
   keys, not raw strings.
3. Tokens via `@/lib/discipline-tokens`. Do not hardcode hex values;
   the CSS variables there are the override seam.
4. Keep primitives stateless. Filter state and data fetching live in
   the consuming tile, not in the primitive.

## Status

PR #2 of the embed track scaffolds this directory with one example
primitive (`MetricCard`). Subsequent embed PRs lift the rest of the
skiplum-pages idioms here as they're needed.
