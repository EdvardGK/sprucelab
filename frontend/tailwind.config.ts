import type { Config } from 'tailwindcss';
import { tokens } from './src/lib/design-tokens';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
  	extend: {
  		colors: {
  			// ── Named palette — Mindful Palettes No. 160 ──
  			silver: tokens.palette.silver,
  			lavender: tokens.palette.lavender,
  			lime: tokens.palette.lime,
  			forest: tokens.palette.forest,
  			navy: tokens.palette.navy,
  			background: {
  				DEFAULT: 'hsl(var(--background))',
  				elevated: 'hsl(var(--card))',
  				overlay: 'hsl(var(--popover))',
  			},
  			foreground: 'hsl(var(--foreground))',
  			border: {
  				subtle: tokens.color.border.subtle,
  				DEFAULT: 'hsl(var(--border))',
  				strong: tokens.color.border.strong,
  			},
  			text: {
  				primary: tokens.color.text.primary,
  				secondary: tokens.color.text.secondary,
  				tertiary: tokens.color.text.tertiary,
  				inverse: tokens.color.text.inverse,
  			},
  			// Surface color for hover states
  			surface: 'hsl(var(--secondary))',
  			// Status colors — OKLCH (see wireframe §9). Same solid color
  			// at three intensities: solid · tinted bg · text-on-tinted.
  			success: {
  				DEFAULT: tokens.color.success,
  				bg: tokens.color.successBg,
  				text: tokens.color.successText,
  			},
  			warning: {
  				DEFAULT: tokens.color.warning,
  				bg: tokens.color.warningBg,
  				text: tokens.color.warningText,
  			},
  			danger: {
  				DEFAULT: tokens.color.danger,
  				bg: tokens.color.dangerBg,
  				text: tokens.color.dangerText,
  			},
  			error: {
  				DEFAULT: tokens.color.error,
  				bg: tokens.color.dangerBg,
  				text: tokens.color.dangerText,
  			},
  			info: {
  				DEFAULT: tokens.color.info,
  				bg: tokens.color.infoBg,
  				text: tokens.color.infoText,
  			},
  			signal: {
  				DEFAULT: tokens.color.signal,
  				bg: tokens.color.signalBg,
  				text: tokens.color.signalText,
  			},
  			neutral: {
  				DEFAULT: tokens.color.neutral,
  				bg: tokens.color.neutralBg,
  				text: tokens.color.neutralText,
  			},
  			brand: tokens.color.brand,
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		fontFamily: tokens.typography.fontFamily,
  		fontSize: tokens.typography.fontSize,
  		spacing: tokens.spacing,
  		borderRadius: {
  			...tokens.radius,
  			DEFAULT: 'var(--radius)',
  		},
  		boxShadow: tokens.shadow,
  		transitionDuration: tokens.transition,
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			shimmer: {
  				'0%': { backgroundPosition: '200% 0' },
  				'100%': { backgroundPosition: '-200% 0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			shimmer: 'shimmer 1.5s ease-in-out infinite'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
