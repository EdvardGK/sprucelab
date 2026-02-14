/**
 * Design Tokens for BIM Coordinator Platform
 *
 * Mindful Palettes No. 160 — five-color system:
 * Silver (#D6D9D8), Lavender (#C7CEE8), Lime (#D0D34D),
 * Forest (#157954), Navy (#21263A)
 *
 * Dark-mode primary (matching IFC analysis dashboard).
 * Light mode derived from same palette.
 * Text and border tokens are CSS-variable-based for mode responsiveness.
 *
 * 8px spacing grid. Inter font.
 */

export const tokens = {
  // ── Named palette ────────────────────────────────────────
  palette: {
    silver:   '#D6D9D8',
    lavender: '#C7CEE8',
    lime:     '#D0D34D',
    forest:   '#157954',
    navy:     '#21263A',
  },
  color: {
    // CSS-variable-based — respond to light/dark mode
    border: {
      subtle: 'hsl(var(--border-subtle))',
      DEFAULT: 'hsl(var(--border))',
      strong: 'hsl(var(--border-strong))',
    },
    text: {
      primary: 'hsl(var(--text-primary))',
      secondary: 'hsl(var(--text-secondary))',
      tertiary: 'hsl(var(--text-tertiary))',
      inverse: 'hsl(var(--text-inverse))',
    },
    // Status colors (consistent across modes)
    success: 'hsl(158 70% 28%)',     // #157954 Forest
    warning: 'hsl(25 96% 61%)',      // #fb923c Orange
    error: 'hsl(0 91% 71%)',         // #f87171 Red
    info: 'hsl(227 35% 70%)',        // Lavender-ish
    brand: 'hsl(158 70% 28%)',       // #157954 Forest
    accent: 'hsl(61 63% 56%)',       // #D0D34D Lime
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      mono: ['Fira Code', 'Consolas', 'Monaco', 'monospace'],
    },
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    },
  },
  spacing: {
    0: '0',
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px (base unit)
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
    10: '2.5rem',  // 40px
    12: '3rem',    // 48px
    16: '4rem',    // 64px
    20: '5rem',    // 80px
    24: '6rem',    // 96px
  },
  radius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    full: '9999px',
  },
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none: 'none',
  },
  transition: {
    DEFAULT: '150ms',
    fast: '100ms',
    slow: '300ms',
  },
};
