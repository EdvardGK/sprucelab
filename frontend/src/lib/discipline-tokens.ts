/**
 * Centralized traffic-light + discipline color tokens.
 *
 * Lifted from skiplum-pages' `_base.html.j2` CSS variables and the backend
 * `apps/core/disciplines.py` enumeration. Single source of truth so the
 * existing `Sidebar.tsx` and any new dashboard primitive (`MetricCard`,
 * `CoverageBar`, `TrafficLightBadge`, `DisciplineRow`) consume the same
 * tokens.
 *
 * Tokens are exposed as plain string literals (CSS custom-prop names).
 * Tailwind arbitrary values + the `cn()` helper compose them at the
 * point of use:
 *
 *   <div className={cn('bg-[var(--tl-green-bg)] text-[var(--tl-green-text)]')}>
 *
 * The actual CSS variable definitions live in
 * `frontend/src/index.css` (PR #2 does not modify them — primitives that
 * need tokens reference existing globals or shadcn theme vars). Adding
 * new vars in subsequent PRs should declare them in `index.css` and
 * re-export the names here.
 */

// ── Traffic-light tokens ──────────────────────────────────────────

export const trafficLight = {
  green: {
    bg: 'var(--tl-green-bg, #d1fae5)',
    text: 'var(--tl-green-text, #065f46)',
  },
  yellow: {
    bg: 'var(--tl-yellow-bg, #fef3c7)',
    text: 'var(--tl-yellow-text, #92400e)',
  },
  red: {
    bg: 'var(--tl-red-bg, #fee2e2)',
    text: 'var(--tl-red-text, #991b1b)',
  },
} as const;

export type TrafficLightLevel = keyof typeof trafficLight;

/**
 * Map a 0–1 fraction to a traffic-light level.
 *   ≥ 0.85 → green
 *   ≥ 0.50 → yellow
 *   else   → red
 *
 * Thresholds match the skiplum-pages CoverageBar idiom. Override at
 * the call site if a domain needs different cutoffs.
 */
export function levelForFraction(
  fraction: number,
  thresholds: { green: number; yellow: number } = { green: 0.85, yellow: 0.5 },
): TrafficLightLevel {
  if (fraction >= thresholds.green) return 'green';
  if (fraction >= thresholds.yellow) return 'yellow';
  return 'red';
}

// ── Discipline tokens ─────────────────────────────────────────────

/**
 * Norwegian BIM discipline codes. Mirror of `apps/core/disciplines.py`
 * on the backend. Values intentionally match the Skiplum colour
 * convention; consumers should reference `discipline.{code}.label` for
 * i18n-bound UI strings rather than the raw enum.
 */
export const disciplineTokens = {
  ARK: { label: 'ARK', color: '#3b82f6' },
  RIB: { label: 'RIB', color: '#22c55e' },
  RIE: { label: 'RIE', color: '#f59e0b' },
  RIV: { label: 'RIV', color: '#06b6d4' },
  RIBR: { label: 'RIBr', color: '#ef4444' },
  BIMK: { label: 'BIMK', color: '#a855f7' },
  LARK: { label: 'LARK', color: '#84cc16' },
} as const;

export type DisciplineCode = keyof typeof disciplineTokens;
