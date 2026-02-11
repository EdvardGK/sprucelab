/**
 * Design Tokens for BIM Coordinator Platform
 *
 * Warm, friendly design inspired by Basecamp/Hey + Airtable:
 * - Paper-like warm whites (not sterile)
 * - Stone grays (warm undertones, not cold zinc)
 * - Vibrant status colors for at-a-glance comprehension
 * - Amber accents (Hey-inspired)
 * - 8px spacing grid
 *
 * Philosophy: Make BIM professionals' lives better through good design
 */

export const tokens = {
  color: {
    // Warm stone borders (not cold zinc)
    border: {
      subtle: 'hsl(30 6% 90%)',      // #E7E5E4 warm subtle
      DEFAULT: 'hsl(30 6% 85%)',     // Warm default border
      strong: 'hsl(30 4% 70%)',      // Warm strong border
    },
    // Text colors for light mode (warm blacks and grays)
    text: {
      primary: 'hsl(24 10% 10%)',    // #1C1917 warm near-black
      secondary: 'hsl(30 4% 35%)',   // #57534E warm gray
      tertiary: 'hsl(30 4% 50%)',    // #A8A29E muted warm
      inverse: 'hsl(40 6% 96%)',     // #FAFAF9 for dark backgrounds
    },
    // Vibrant status colors
    success: 'hsl(142 76% 36%)',     // #22C55E green
    warning: 'hsl(38 92% 50%)',      // #F59E0B amber
    error: 'hsl(0 84% 60%)',         // #EF4444 red
    info: 'hsl(217 91% 60%)',        // #3B82F6 blue
    brand: 'hsl(214 60% 55%)',       // #4A90D9 warm blue
    accent: 'hsl(38 92% 50%)',       // #F59E0B amber (Hey-inspired)
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
