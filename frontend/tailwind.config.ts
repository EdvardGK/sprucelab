import type { Config } from 'tailwindcss';
import { tokens } from './src/lib/design-tokens';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
  	extend: {
  		colors: {
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
  			success: tokens.color.success,
  			warning: tokens.color.warning,
  			error: tokens.color.error,
  			info: tokens.color.info,
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
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
