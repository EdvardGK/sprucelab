# Dashboard design — playful meets confident professional

**Sources synthesized**: skiplum-reports HTML (our own design language), Linear's
public design notes, F1Studioz / Improvado / Muz.li 2026 round-ups, the
ModelWorkspace pattern in this repo.

## Principles (in priority order)

1. **Traffic-light over text.** Color is the fastest visual signal. Use
   paired colors: bg + text + 8px dot — green `#22c55e` / amber `#f59e0b`
   / red `#ef4444`. Every gap-style metric gets one. Already on the KPI
   row; extend to table rows + Top-10 bars + filter chips.

2. **Sparkline under every KPI number.** Single-number tiles are dead in
   2026. A tiny line or bar chart (8–12 px tall) under the headline
   value adds instant context: trend over time, distribution by class,
   share of total. Most-requested + most-underused pattern.

3. **40-30-20-10 space rule.** 40% screen to the hero metric, 30% to
   2–3 secondary KPIs, 20% to trend context (sparklines, comparison
   bars), 10% to nav/filter. Our v2 page currently splits closer to
   33-33-33; the treemap should be the hero (40%), KPIs secondary,
   table tertiary.

4. **Microinteractions ≤ 400 ms.** Count-up animation on KPI numbers
   when they load (300 ms cubic-out). Hover lift on cards
   (`transform: translateY(-1px) + shadow-md`). Row-click selection
   pulse on the table. All functional, never decorative.

5. **Tabular numerals everywhere.** `font-variant-numeric: tabular-nums`
   on every number column — instant Stripe / Linear feel. Already on
   KPIs; missing on filter bar count and Top-10 numbers.

6. **Gradient top-accent strip.** 3 px candy stripe at top of page:
   `bg-gradient-to-r from-[#D0D34D] via-[#157954] to-[#21263A]`. Our
   skiplum-reports fork uses this as a signature element. Zero info,
   pure identity.

7. **Skeleton states with shimmer, not pulse.** `animate-pulse` looks
   like "loading"; a left-to-right shimmer gradient looks like part of
   the design. Custom Tailwind keyframe, ~10 lines.

8. **Status dot + label, never just one.** 8 px colored circle beside
   the text. The dot draws the eye; the text disambiguates.

9. **Live freshness signal.** A "last updated 12 s ago" timestamp with
   a small pulsing green dot in the header. Conveys liveness without
   shouting.

10. **Confident negative space.** Linear's lesson: don't fill every
    tile. Empty space is a design choice, not slack. Treemap + viewer
    each get a full quadrant; KPI tiles have ~20% empty top area.

## What skiplum-reports does that we don't (yet)

- 12-column flexible grid with `.span-*` helpers (our DashboardGrid is
  locked to 4 — fine for simple layouts, blocker for the "40-30-20-10"
  split).
- `.tl-cell` / `.tl-text` / `.tl-dot` traffic-light primitive trio.
- Gradient top-accent strip on every page.
- `.bar-fill` with `transition: width 0.4s ease` — animated progress
  bars that count up on data load.
- High-letter-spacing small-caps labels (`text-[0.65rem] uppercase
  tracking-[0.06em]`) — already on our KPI labels; should propagate.
- Backdrop-blur sidebar (skiplum-reports static; we have shadcn — same
  vibe achievable with `backdrop-blur-md` + `bg-card/70`).

## What Linear teaches that we already do

- Reduced visual noise: sidebar is quiet, no aggressive color shifts.
- Compose-don't-reflow: filter clicks mutate the view, don't open
  modals.
- Tactical workspaces: one focused screen per task.

These three are working; don't break them.

## Concrete shortlist for the Types v2 page

Ranked by *impact ÷ effort*:

1. **Gradient top-accent strip** (5 min) — drop into `AppLayout` or
   the v2 page header. Pure identity, zero info, immediate vibe shift.
2. **Sparklines in KPI cards** (~90 min) — small SVG bars under each
   number. For "Total types": stacked bar by IFC class. For "Untyped":
   bar of contributing classes. For "Missing classification": progress
   strip filled to (1 − missing%). Big dopamine, big context.
3. **Count-up animation on KPI numbers** (~20 min) — small
   `useCountUp(target, duration)` hook. 300 ms cubic-out.
4. **Shimmer skeleton states** (~15 min) — Tailwind keyframe + a
   `<Shimmer />` component. Replace `animate-pulse` skeletons.
5. **Hover lift on KPI cards** (~5 min) — `hover:-translate-y-0.5
   hover:shadow-md transition-all duration-200`.
6. **Status dot column on the table** (~30 min) — leading 8 px circle
   per row, color by missing-property count. Replaces "Flags"
   conceptually but tighter.
7. **Last-updated + live dot** in header (~20 min) — `useQueryClient`
   to read the fetch time, pulsing green dot via Tailwind keyframe.
8. **Animated progress bars** in Top-10 (~10 min) — replace static
   width with `transition-all duration-700 ease-out` so bars sweep in
   on data load.

## What NOT to do

- **No glassmorphism overload.** Backdrop-blur on one surface (sidebar)
  is enough. On every card it becomes Vista / Aero kitsch.
- **No gratuitous animation.** Anything > 400 ms feels slow; anything
  decorative feels juvenile. Every motion must serve a function.
- **No emojis in UI** (per CLAUDE.md global rule). Icons via lucide.
- **No "Mapped %" framing.** Modelers own the data; we surface gaps —
  see `feedback-modelers-own-data-platform-suggests.md`.

## Sources

- [skiplum-reports types index.html](file://~/workspace/skiplum/dev/skiplum-reports/projects/grnland-55/types/index.html) — our own design substrate
- [Linear: dashboards best practices](https://linear.app/now/dashboards-best-practices)
- [Linear: how we redesigned the UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [F1Studioz: Smart SaaS Dashboard Design Guide 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/)
- [Muz.li: 50 Best Dashboard Design Examples 2026](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)
- [Tabular Editor: KPI card best practices](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design)
- [Speculative Chic: Modern Dashboard Design Trends 2026](https://speculativechic.com/modern-dashboard-design-trends-for-mobile-apps-in-2026/)
