/**
 * Design Tokens — single source of truth for every visual constant.
 *
 * Iron rule: NO file outside this one is allowed to declare its own
 * palette array, hex literal in a color slot, or semantic color value.
 * Add to `tokens` here and import from `tokens` everywhere else.
 *
 * Layers:
 *   - `palette`     — five brand-anchor hex colors (Mindful Palettes No. 160).
 *                     Keep for places that already reference them by name
 *                     (e.g. forest in `card-accent-forest`).
 *   - `dataPalette` — OKLCH gradient generator for class swatches /
 *                     treemap cells / sparkline segments. Slots are
 *                     deterministic samples of a polyline through OKLCH
 *                     space (lime → forest → navy), subdivided via the
 *                     van der Corput / bit-reversal sequence. See
 *                     `lib/colorMath.ts` for the math and
 *                     `docs/wireframes/color-system.html` for the visual.
 *   - `color`       — semantic surface / text / border tokens, plus the
 *                     six status families from wireframe §9
 *                     (success / warning / danger / info / signal / neutral)
 *                     at three intensities (solid / tinted background /
 *                     text-on-tinted).
 *   - `typography`, `spacing`, `radius`, `shadow`, `transition` — standard.
 */

import { PALETTE_VERTICES, PALETTE_12, paletteSlot, type OKLCH } from './colorMath';

export const tokens = {
  // ── Brand anchor palette — Mindful Palettes No. 160 ─────────────
  palette: {
    silver:   '#D6D9D8',
    lavender: '#C7CEE8',
    lime:     '#D0D34D',
    forest:   '#157954',
    navy:     '#21263A',
  },

  // ── Data palette — OKLCH triangle gradient with bit-reversal slots ──
  // Use for any "many similar things" surface (treemap cells, class
  // sparklines, table row stripes, KPI per-class bars). NEVER hardcode.
  dataPalette: {
    /** Triangle gradient vertices (lime → forest → navy). */
    vertices: PALETTE_VERTICES as readonly OKLCH[],
    /**
     * Pre-computed 12-slot palette. Slot N → stable OKLCH color string.
     * Drop-in replacement for the legacy 12-color brand-hex arrays —
     * same length, same indexing semantics, new gradient.
     */
    slots: PALETTE_12,
    /** Direct generator for callers that need >12 slots. */
    slot: paletteSlot,
  },

  // ── Semantic colors ──────────────────────────────────────────────
  color: {
    // CSS-variable-backed — respond to light/dark mode.
    border: {
      subtle:  'hsl(var(--border-subtle))',
      DEFAULT: 'hsl(var(--border))',
      strong:  'hsl(var(--border-strong))',
    },
    text: {
      primary:   'hsl(var(--text-primary))',
      secondary: 'hsl(var(--text-secondary))',
      tertiary:  'hsl(var(--text-tertiary))',
      inverse:   'hsl(var(--text-inverse))',
    },

    // ── Status families (OKLCH; see wireframe §9) ──
    // solid           — chips, dots, KPI top-borders
    // *Bg             — tinted callout background (L≈0.95)
    // *Text           — text on tinted bg (L≈0.40, ≥ 4.5:1 contrast)
    success:      'oklch(0.62 0.17 145)',
    successBg:    'oklch(0.95 0.04 145)',
    successText:  'oklch(0.40 0.17 145)',

    warning:      'oklch(0.78 0.16 85)',
    warningBg:    'oklch(0.96 0.04 85)',
    warningText:  'oklch(0.40 0.16 85)',

    danger:       'oklch(0.58 0.22 25)',
    dangerBg:     'oklch(0.94 0.05 25)',
    dangerText:   'oklch(0.40 0.18 25)',

    info:         'oklch(0.62 0.16 240)',
    infoBg:       'oklch(0.95 0.04 240)',
    infoText:     'oklch(0.40 0.16 240)',

    /** Selection / active cross-filter signal. ALWAYS means "this is what you picked". */
    signal:       'oklch(0.78 0.18 50)',
    signalBg:     'oklch(0.96 0.05 50)',
    signalText:   'oklch(0.42 0.18 50)',

    /** Indeterminate / not-yet-analysed / disabled. */
    neutral:      'oklch(0.55 0.01 250)',
    neutralBg:    'oklch(0.96 0.01 250)',
    neutralText:  'oklch(0.40 0.02 250)',

    // ── Legacy aliases. Kept as the new OKLCH values so existing
    // call sites (Tailwind `bg-error`, etc.) keep working through the
    // transition. Prefer `danger` going forward. ──
    error:   'oklch(0.58 0.22 25)',
    brand:   'oklch(0.45 0.13 155)',  // forest vertex
    accent:  'oklch(0.85 0.20 130)',  // lime vertex
  },

  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      mono: ['Fira Code', 'Consolas', 'Monaco', 'monospace'],
    },
    fontSize: {
      xs:     ['0.75rem',  { lineHeight: '1rem' }],
      sm:     ['0.875rem', { lineHeight: '1.25rem' }],
      base:   ['1rem',     { lineHeight: '1.5rem' }],
      lg:     ['1.125rem', { lineHeight: '1.75rem' }],
      xl:     ['1.25rem',  { lineHeight: '1.75rem' }],
      '2xl':  ['1.5rem',   { lineHeight: '2rem' }],
      '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl':  ['2.25rem',  { lineHeight: '2.5rem' }],
    },
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
  },
  radius: {
    sm:     '0.25rem',
    md:     '0.375rem',
    lg:     '0.5rem',
    xl:     '0.75rem',
    '2xl':  '1rem',
    full:   '9999px',
  },
  shadow: {
    sm:      '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md:      '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg:      '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl:      '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl':   '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner:   'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none:    'none',
  },
  transition: {
    DEFAULT: '150ms',
    fast:    '100ms',
    slow:    '300ms',
  },
};

/**
 * Status type catalog — pairs a status kind with its color triplet and
 * a glyph for color-blind safety (NN/g rule: never color alone). Use
 * for chips, callouts, status dots, KPI top-borders.
 */
export type StatusKind = 'success' | 'warning' | 'danger' | 'info' | 'signal' | 'neutral';

export interface StatusToken {
  kind: StatusKind;
  solid: string;
  bg: string;
  text: string;
  glyph: string;
}

export const STATUS: Record<StatusKind, StatusToken> = {
  success: { kind: 'success', solid: tokens.color.success, bg: tokens.color.successBg, text: tokens.color.successText, glyph: '✓' },
  warning: { kind: 'warning', solid: tokens.color.warning, bg: tokens.color.warningBg, text: tokens.color.warningText, glyph: '!' },
  danger:  { kind: 'danger',  solid: tokens.color.danger,  bg: tokens.color.dangerBg,  text: tokens.color.dangerText,  glyph: '✕' },
  info:    { kind: 'info',    solid: tokens.color.info,    bg: tokens.color.infoBg,    text: tokens.color.infoText,    glyph: 'ℹ' },
  signal:  { kind: 'signal',  solid: tokens.color.signal,  bg: tokens.color.signalBg,  text: tokens.color.signalText,  glyph: '◆' },
  neutral: { kind: 'neutral', solid: tokens.color.neutral, bg: tokens.color.neutralBg, text: tokens.color.neutralText, glyph: '—' },
};
