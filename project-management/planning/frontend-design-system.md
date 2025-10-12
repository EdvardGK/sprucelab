# BIM Coordinator Platform - Frontend Design System

**Version:** 1.0
**Date:** 2025-10-11
**Status:** Foundation Specification

---

## Philosophy

**Build on proven patterns, not from scratch.**

This platform uses the exact same foundation as Linear, Vercel, Supabase, and Railway:
- **Radix UI** for accessible, unstyled primitives (behavior)
- **Tailwind CSS** for utility-first styling (appearance)
- **shadcn/ui** for pre-composed, copy-paste components (composition)
- **CSS variables** for runtime theming
- **TypeScript** for type-safe design tokens

Then we layer on:
- **BIM-specific layouts** (3-panel viewer, model tree, property panels)
- **Spruce Forge brand** (nature-inspired, desaturated for dark mode)
- **3D visualization** (Three.js, graph viz)

---

## 1. Foundation Stack

### Core Technologies

```
React 18 + TypeScript
├── Vite (build tool)
├── React Router v6 (routing)
└── Zustand (state management)

Styling
├── Tailwind CSS v4
├── Radix UI primitives
└── shadcn/ui components (copy-paste)

Data & API
├── Tanstack Query (React Query)
├── Axios (HTTP client)
└── Zod (schema validation)

Visualization
├── Three.js + @react-three/fiber (3D viewer)
├── @react-three/drei (helpers)
├── react-force-graph-3d (graph viz)
└── Recharts (data charts)
```

### Why This Stack?

**Radix UI:**
- Battle-tested accessibility (ARIA, keyboard nav)
- Unstyled primitives (Dialog, Dropdown, Popover, etc.)
- Headless components (full styling control)

**Tailwind CSS:**
- Utility-first (no custom CSS files)
- Design tokens via config
- Dark mode built-in
- Responsive by default

**shadcn/ui:**
- NOT an npm package (you own the code)
- Pre-composed Radix + Tailwind components
- Copy-paste into your project
- Customize freely

**This is the modern SaaS standard in 2025.**

---

## 2. Design Tokens (Zero Hardcoding)

### Token Structure

All visual values come from design tokens. Never hardcode colors, fonts, or spacing.

```typescript
// lib/design-tokens.ts
export const tokens = {
  color: {
    // Base colors (dark minimalism)
    background: {
      base: '#0a0f14',        // Deep dark (not pure black)
      elevated: '#141b22',     // Surface cards
      overlay: '#1f2933',      // Modals, dropdowns
    },
    border: {
      subtle: '#2d3748',       // Low contrast
      default: '#4a5568',      // Standard borders
      strong: '#718096',       // Emphasized borders
    },
    text: {
      primary: '#fafafa',      // Off-white (not pure white)
      secondary: '#cbd5e0',    // Muted text
      tertiary: '#a0aec0',     // Disabled text
      inverse: '#1a202c',      // Text on light backgrounds
    },

    // Semantic colors (desaturated for dark mode)
    success: '#48bb78',        // Muted green
    warning: '#ed8936',        // Muted orange
    error: '#fc8181',          // Muted red
    info: '#4299e1',           // Muted blue

    // Spruce Forge brand (desaturated)
    brand: {
      // Ocean (primary accent)
      ocean: {
        50: '#e6f7ff',
        100: '#bae7ff',
        200: '#91d5ff',
        300: '#69c0ff',
        400: '#40a9ff',
        500: '#1890ff',    // Primary
        600: '#096dd9',
        700: '#0050b3',
        800: '#003a8c',
        900: '#002766',
      },
      // Forest (secondary accent)
      forest: {
        50: '#d9f2e6',
        100: '#b3e5cc',
        200: '#8dd9b3',
        300: '#66cc99',
        400: '#40bf80',
        500: '#33a070',  // Secondary
        600: '#2d8960',
        700: '#267250',
        800: '#1f5b40',
        900: '#194430',
      },
      // Mint (tertiary accent - desaturated neon)
      mint: '#5dffca',       // Muted from original #00ff88
      // Cyan (quaternary accent - desaturated neon)
      cyan: '#5ddfff',       // Muted from original #00ffff
    },
  },

  typography: {
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: 'JetBrains Mono, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',     // 12px
      sm: '0.875rem',    // 14px
      base: '1rem',      // 16px
      lg: '1.125rem',    // 18px
      xl: '1.25rem',     // 20px
      '2xl': '1.5rem',   // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
  },

  radius: {
    none: '0',
    sm: '0.25rem',   // 4px
    md: '0.375rem',  // 6px
    lg: '0.5rem',    // 8px
    xl: '0.75rem',   // 12px
    full: '9999px',
  },

  shadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
    // Subtle glow for accents
    glow: '0 0 20px rgba(29, 144, 255, 0.15)',
  },

  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// TypeScript types for autocomplete
export type Theme = typeof tokens;
export type ColorToken = keyof typeof tokens.color;
```

### Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import { tokens } from './src/lib/design-tokens';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: tokens.color.background,
        border: tokens.color.border,
        text: tokens.color.text,
        success: tokens.color.success,
        warning: tokens.color.warning,
        error: tokens.color.error,
        info: tokens.color.info,
        brand: tokens.color.brand,
      },
      fontFamily: tokens.typography.fontFamily,
      fontSize: tokens.typography.fontSize,
      spacing: tokens.spacing,
      borderRadius: tokens.radius,
      boxShadow: tokens.shadow,
      transitionDuration: tokens.transition,
    },
  },
  plugins: [],
} satisfies Config;
```

### CSS Variables (Runtime Theming)

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* shadcn/ui semantic variables */
    --background: 10 15 20;           /* #0a0f14 */
    --foreground: 250 250 250;        /* #fafafa */

    --card: 20 27 34;                 /* #141b22 */
    --card-foreground: 250 250 250;

    --popover: 31 41 51;              /* #1f2933 */
    --popover-foreground: 250 250 250;

    --primary: 24 144 255;            /* #1890ff */
    --primary-foreground: 250 250 250;

    --secondary: 51 160 112;          /* #33a070 */
    --secondary-foreground: 250 250 250;

    --muted: 74 85 104;               /* #4a5568 */
    --muted-foreground: 203 213 224;  /* #cbd5e0 */

    --accent: 93 255 202;             /* #5dffca */
    --accent-foreground: 26 32 44;    /* #1a202c */

    --destructive: 252 129 129;       /* #fc8181 */
    --destructive-foreground: 250 250 250;

    --border: 45 55 72;               /* #2d3748 */
    --input: 74 85 104;               /* #4a5568 */
    --ring: 24 144 255;               /* #1890ff */

    --radius: 0.5rem;
  }
}

* {
  @apply border-border;
}

body {
  @apply bg-background text-foreground;
  font-feature-settings: 'rlig' 1, 'calt' 1;
}
```

---

## 3. Dark Minimalism Principles (2025 SaaS)

### Core Tenets

**1. Not Pure Black**
- Use dark gray (#0a0f14, #121212) for backgrounds
- Pure black (#000000) is too harsh, creates eye strain
- Dark gray provides better contrast with content

**2. Desaturated Colors**
- Bright, saturated colors are jarring on dark backgrounds
- Dial down saturation 20-30% from light mode values
- Maintains color identity while improving comfort

**3. Generous Negative Space**
- Dark UIs feel heavy; counteract with sparse layouts
- 8px spacing grid minimum
- Padding > borders (use spacing to separate, not lines)

**4. Subtle Elevation**
- Cards and surfaces use slightly lighter backgrounds
- Shadows are less visible in dark mode; use border + background
- 3-level hierarchy: base (#0a0f14) → elevated (#141b22) → overlay (#1f2933)

**5. Text Hierarchy**
- Primary text: Off-white (#fafafa), not pure white
- Secondary text: Muted (#cbd5e0)
- Tertiary/disabled: Very muted (#a0aec0)
- Never use mid-gray for body text (hard to read)

**6. Accessibility First**
- WCAG 2.1 AA minimum (4.5:1 contrast for normal text)
- Focus indicators clearly visible (not just color change)
- Keyboard navigation for all interactive elements

### Material Design Dark Theme Guidelines

Follow Google's recommendations:
- Surface color: Dark gray (#121212)
- Elevation via lighter surfaces (not just shadows)
- High-emphasis text: 87% white
- Medium-emphasis: 60% white
- Disabled: 38% white

### Linear/Vercel Pattern

**Characteristics:**
- High contrast for readability
- Smooth, minimal animations (200ms transitions)
- Hover states: Subtle background change + border glow
- Focus states: Ring outline (2px, accent color)
- Consistent spacing (8px grid)
- Monochrome with bold accent colors

---

## 4. Component Architecture

### Radix Primitives We Use

```typescript
// Core primitives (install from @radix-ui/react-*)
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import * as Slider from '@radix-ui/react-slider';
import * as Checkbox from '@radix-ui/react-checkbox';
```

### shadcn/ui Components (Copy-Paste)

**Essential components to copy:**
1. `button` - Primary UI element
2. `input` - Form inputs
3. `card` - Content containers
4. `dialog` - Modals
5. `dropdown-menu` - Context menus
6. `popover` - Floating panels
7. `tooltip` - Help text
8. `select` - Dropdowns
9. `switch` - Toggles
10. `tabs` - Tab navigation
11. `badge` - Status indicators
12. `table` - Data tables
13. `command` - Command palette (Cmd+K)

**Installation:**
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
# ... etc
```

### Component Composition Pattern

```tsx
// Example: Composed Dialog
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function UploadModelDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload IFC Model</DialogTitle>
        </DialogHeader>

        {/* Custom content */}
        <UploadForm />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload}>
            Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. BIM-Specific Patterns

### 3-Panel Layout (Primary View)

```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Breadcrumbs | Model Name | Actions       │
├──────────┬────────────────────────────┬─────────────────┤
│          │                            │                 │
│  Model   │                            │   Properties    │
│  Tree    │       3D Viewer            │   Panel         │
│  (20%)   │       (60%)                │   (20%)         │
│          │                            │                 │
│  [tree]  │  [Three.js canvas]         │  [props]        │
│          │                            │                 │
│          │                            │                 │
├──────────┴────────────────────────────┴─────────────────┤
│ Footer: Element count | Status | Selected               │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
// layouts/BIMViewerLayout.tsx
export function BIMViewerLayout() {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated px-4 py-3">
        <BIMHeader />
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Model tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <ModelTree />
        </ResizablePanel>

        {/* 3D viewer */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <Viewer3D />
        </ResizablePanel>

        {/* Properties */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <PropertyPanel />
        </ResizablePanel>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-background-elevated px-4 py-2">
        <BIMFooter />
      </footer>
    </div>
  );
}
```

### Model Tree Component

**Pattern: Nested list with depth coloring**

```tsx
// components/bim/ModelTree.tsx
import { ChevronRight, ChevronDown } from 'lucide-react';

interface TreeNode {
  id: string;
  name: string;
  type: string;
  children?: TreeNode[];
  depth: number;
}

export function ModelTree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="h-full overflow-y-auto bg-background p-2">
      <div className="mb-2">
        <input
          type="search"
          placeholder="Search elements..."
          className="w-full rounded-md border border-border bg-background-elevated px-3 py-1.5 text-sm"
        />
      </div>

      <ul className="space-y-0.5">
        {nodes.map(node => (
          <TreeItem key={node.id} node={node} />
        ))}
      </ul>
    </div>
  );
}

function TreeItem({ node }: { node: TreeNode }) {
  const [isOpen, setIsOpen] = useState(true);

  // Ocean depth coloring
  const depthColors = {
    0: 'text-brand-cyan',      // Surface
    1: 'text-brand-ocean-400', // Mid
    2: 'text-brand-ocean-600', // Deep
    3: 'text-brand-forest-400',
  };

  return (
    <li>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-sm hover:bg-background-elevated"
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
      >
        {node.children?.length ? (
          isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
        ) : (
          <span className="w-4" />
        )}

        <span className={depthColors[node.depth] || 'text-text-secondary'}>
          {node.name}
        </span>
      </button>

      {isOpen && node.children && (
        <ul>
          {node.children.map(child => (
            <TreeItem key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

### Property Panel Component

**Pattern: Collapsible sections with copy-on-click**

```tsx
// components/bim/PropertyPanel.tsx
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy } from 'lucide-react';

interface PropertyGroup {
  name: string;
  properties: Array<{ name: string; value: string; unit?: string }>;
}

export function PropertyPanel({ groups }: { groups: PropertyGroup[] }) {
  return (
    <div className="h-full overflow-y-auto bg-background p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Properties</h3>
      </div>

      <div className="space-y-3">
        {groups.map(group => (
          <Card key={group.name} className="p-3">
            <h4 className="mb-2 text-xs font-medium uppercase text-text-secondary">
              {group.name}
            </h4>

            <dl className="space-y-1.5">
              {group.properties.map(prop => (
                <div key={prop.name} className="flex items-start justify-between gap-2 text-sm">
                  <dt className="text-text-secondary">{prop.name}</dt>
                  <dd className="flex items-center gap-1 font-medium text-text-primary">
                    <span>
                      {prop.value}
                      {prop.unit && <span className="ml-1 text-text-tertiary">{prop.unit}</span>}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(prop.value)}
                      className="opacity-0 hover:opacity-100 group-hover:opacity-50"
                    >
                      <Copy size={14} />
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### 3D Viewer Toolbar

**Pattern: Floating toolbar with tool groups**

```tsx
// components/bim/ViewerToolbar.tsx
import { Cube, Move, ZoomIn, Eye, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function ViewerToolbar() {
  return (
    <div className="absolute left-4 top-4 flex items-center gap-1 rounded-lg border border-border bg-background-elevated p-1 shadow-lg">
      {/* Navigation tools */}
      <Button variant="ghost" size="icon" title="Orbit">
        <Cube size={18} />
      </Button>
      <Button variant="ghost" size="icon" title="Pan">
        <Move size={18} />
      </Button>
      <Button variant="ghost" size="icon" title="Zoom">
        <ZoomIn size={18} />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Display tools */}
      <Button variant="ghost" size="icon" title="Toggle visibility">
        <Eye size={18} />
      </Button>
      <Button variant="ghost" size="icon" title="Section box">
        <Box size={18} />
      </Button>
    </div>
  );
}
```

---

## 6. Dashboard Patterns (Linear-Style)

### Project Grid

```tsx
// pages/Dashboard.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

export function Dashboard() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Projects</h1>
          <p className="text-text-secondary">Manage your BIM coordination projects</p>
        </div>

        <Button>
          <Plus size={18} className="mr-2" />
          New Project
        </Button>
      </div>

      {/* Grid of project cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <Card key={project.id} className="cursor-pointer transition-all hover:shadow-glow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                  {project.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Models</dt>
                  <dd className="font-medium">{project.modelCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Last updated</dt>
                  <dd className="text-text-tertiary">{project.updatedAt}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### Command Palette (Cmd+K)

```tsx
// components/CommandPalette.tsx
import { useEffect, useState } from 'react';
import { Command } from '@/components/ui/command';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <Command open={open} onOpenChange={setOpen}>
      {/* Command items */}
    </Command>
  );
}
```

---

## 7. Responsive Design (Desktop-First)

### Primary Use Case: Desktop/Laptop

**Target Resolutions:**
- **1920x1080** (Full HD) - Primary target
- **2560x1440** (2K) - Common on design workstations
- **3840x2160** (4K) - High-end monitors
- **1366x768** (HD) - Minimum supported laptop

### Breakpoints

```typescript
// Tailwind breakpoints (desktop-first approach)
const breakpoints = {
  sm: '640px',    // Large phone landscape / small tablet
  md: '768px',    // Tablet portrait
  lg: '1024px',   // Laptop
  xl: '1280px',   // Desktop
  '2xl': '1536px' // Large desktop
};
```

### Layout Adaptations

**Desktop (1920x1080+):**
```
┌─────────────────────────────────────────────────────────┐
│ Header                                                   │
├──────────┬────────────────────────────┬─────────────────┤
│  Tree    │      3D Viewer             │   Properties    │
│  20%     │      60%                   │   20%           │
└──────────┴────────────────────────────┴─────────────────┘
```

**Laptop (1366x768 - 1920x1080):**
```
┌─────────────────────────────────────────────────────────┐
│ Header                                                   │
├──────────┬────────────────────────────┬─────────────────┤
│  Tree    │      3D Viewer             │   Properties    │
│  25%     │      50%                   │   25%           │
│ (Collapsible)                         │ (Collapsible)   │
└──────────┴────────────────────────────┴─────────────────┘
```

**Tablet (768px - 1024px):**
```
┌─────────────────────────────────────────┐
│ Header + Burger Menu                    │
├─────────────────────────────────────────┤
│                                         │
│        3D Viewer (Full Width)           │
│                                         │
├─────────────────────────────────────────┤
│ [Drawer] Tree / Properties              │
└─────────────────────────────────────────┘
```
- Tree becomes slide-out drawer (left)
- Properties becomes slide-out drawer (right)
- Bottom toolbar for quick actions

**Mobile (< 768px):**
```
┌───────────────────┐
│ Header + Menu     │
├───────────────────┤
│                   │
│   Read-Only       │
│   Viewer          │
│   (Touch Nav)     │
│                   │
├───────────────────┤
│ Bottom Sheet      │
│ [Tabs]            │
│ Tree | Properties │
└───────────────────┘
```
- **View-only mode** (no editing, just inspection)
- Touch-friendly 3D navigation
- Bottom sheet with tabs for tree/properties
- Simplified toolbar

### Component Responsiveness

**Model Tree:**
```tsx
// Desktop: Full tree in sidebar
<aside className="hidden lg:block w-64">
  <ModelTree expanded />
</aside>

// Tablet/Mobile: Drawer
<Drawer>
  <ModelTree compact />
</Drawer>
```

**Property Panel:**
```tsx
// Desktop: Fixed right panel
<aside className="hidden xl:block w-80">
  <PropertyPanel />
</aside>

// Tablet: Collapsible drawer
<Drawer side="right">
  <PropertyPanel />
</Drawer>

// Mobile: Bottom sheet
<Sheet>
  <PropertyPanel compact />
</Sheet>
```

**Dashboard Grid:**
```tsx
// Responsive grid
<div className="grid gap-4
  grid-cols-1           // Mobile: 1 column
  md:grid-cols-2        // Tablet: 2 columns
  lg:grid-cols-3        // Laptop: 3 columns
  xl:grid-cols-4        // Desktop: 4 columns
">
  {projects.map(p => <ProjectCard />)}
</div>
```

### Mobile/Tablet Considerations

**What Works on Mobile:**
- ✅ View project list
- ✅ Check model status
- ✅ Navigate spatial hierarchy
- ✅ View element properties
- ✅ Simple 3D navigation (orbit, zoom)
- ✅ View change summaries

**What Doesn't Work on Mobile:**
- ❌ Complex 3D editing
- ❌ Multi-model comparison
- ❌ Graph visualization (too complex)
- ❌ Detailed property editing
- ❌ Large data exports

**Touch Interactions:**
```tsx
// 3D Viewer touch controls
const touchControls = {
  '1 finger': 'Rotate camera',
  '2 fingers': 'Pan',
  'Pinch': 'Zoom',
  'Tap': 'Select element'
};
```

### Viewport-Specific Features

**Large Monitors (2K/4K):**
- More panels visible simultaneously
- Larger text remains readable
- More detailed property views
- Extended toolbar options

**Laptops:**
- Collapsible side panels
- Compact toolbar
- Reduced padding/spacing
- Optimized for 13-15" screens

**Tablets:**
- Touch-friendly hit targets (48px min)
- Simplified UI (fewer buttons)
- Drawer-based navigation
- Read-heavy, write-light

**Phones:**
- View-only by default
- Bottom navigation bar
- Pull-to-refresh
- Minimal chrome (hide header on scroll)

### Implementation Strategy

```tsx
// Use Tailwind responsive utilities
<div className="
  p-2 md:p-4 lg:p-6           // Responsive padding
  text-sm md:text-base        // Responsive text
  hidden lg:block             // Hide on mobile/tablet
  flex-col lg:flex-row        // Stack on mobile, row on desktop
">
  {/* Content */}
</div>

// Use react-resizable-panels for desktop
<ResizablePanel
  defaultSize={60}
  minSize={40}
  className="hidden lg:block"  // Desktop only
>
  <Viewer3D />
</ResizablePanel>
```

### Testing Strategy

**Required Test Devices:**
1. **Desktop (1920x1080)** - Primary development target
2. **Laptop (1366x768)** - Minimum supported resolution
3. **iPad (1024x768)** - Tablet reference
4. **iPhone (375x667)** - Mobile reference

**Browser DevTools Responsive Mode:**
- Test all breakpoints
- Verify touch targets (48px min)
- Check text readability
- Test drawer animations

### Key Principle

> **Desktop = Full Experience, Mobile = Quick Access**
>
> Design for power users on desktop. Mobile is for checking status, viewing models on-site, and quick navigation. Don't compromise desktop UX for mobile parity.

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Setup:**
- [ ] Initialize Vite + React + TypeScript
- [ ] Install Tailwind CSS v4
- [ ] Install shadcn/ui CLI
- [ ] Configure PostCSS and Tailwind config
- [ ] Set up routing (React Router v6)

**Design System:**
- [ ] Create `lib/design-tokens.ts`
- [ ] Configure Tailwind with tokens
- [ ] Set up CSS variables in `globals.css`
- [ ] Install Inter font (Google Fonts)

**Core Components:**
- [ ] Install Radix UI primitives
- [ ] Copy shadcn/ui components: button, input, card, dialog, dropdown-menu
- [ ] Create theme provider component
- [ ] Test dark mode switching

### Phase 2: Layouts (Week 1-2)

**Navigation:**
- [ ] Header component (logo, breadcrumbs, actions)
- [ ] Sidebar navigation (collapsible)
- [ ] Command palette (Cmd+K)
- [ ] Footer component

**Layouts:**
- [ ] Dashboard layout (simple container)
- [ ] BIM viewer layout (3-panel resizable)
- [ ] Resizable panel component (react-resizable-panels)

### Phase 3: Dashboard & Projects (Week 2)

**Pages:**
- [ ] Dashboard page (project grid)
- [ ] Project detail page (model list)
- [ ] Empty states for no projects/models

**Components:**
- [ ] Project card component
- [ ] Create project dialog
- [ ] Model upload component (drag-and-drop)
- [ ] Search and filter bar

**State Management:**
- [ ] Set up Zustand stores (ui-state, filters)
- [ ] Set up React Query (API client, hooks)

### Phase 4: 3D Viewer (Week 3)

**Three.js Setup:**
- [ ] Install Three.js, @react-three/fiber, @react-three/drei
- [ ] Create Viewer3D component
- [ ] Load geometry from API
- [ ] Camera controls (OrbitControls)
- [ ] Basic lighting setup

**Viewer Features:**
- [ ] Element selection (raycasting)
- [ ] Color by type/storey
- [ ] Viewer toolbar component
- [ ] Bounding box display
- [ ] Loading states

### Phase 5: BIM Components (Week 3-4)

**Model Tree:**
- [ ] Tree component with expand/collapse
- [ ] Search and filter
- [ ] Depth coloring (ocean theme)
- [ ] Selected element highlight

**Property Panel:**
- [ ] Collapsible property groups
- [ ] Copy to clipboard
- [ ] Property search
- [ ] Empty state when nothing selected

**Data Integration:**
- [ ] Connect to backend API
- [ ] Load spatial hierarchy
- [ ] Load entity properties
- [ ] Real-time updates (React Query)

### Phase 6: Graph Visualization (Week 4)

**Graph Viewer:**
- [ ] Install react-force-graph-3d
- [ ] Load nodes and edges from API
- [ ] Color by IFC type
- [ ] Node click → show properties
- [ ] Graph controls (zoom, rotate, center)

### Phase 7: Change Detection UI (Week 5)

**Comparison View:**
- [ ] Side-by-side layout
- [ ] Change statistics cards
- [ ] Added/removed/modified lists
- [ ] Property diff table
- [ ] 3D diff viewer (highlight changes)

### Phase 8: Polish (Week 6)

**Animations:**
- [ ] Install Framer Motion
- [ ] Page transitions
- [ ] List animations
- [ ] Skeleton loaders

**Performance:**
- [ ] Virtual scrolling for large lists (@tanstack/react-virtual)
- [ ] Code splitting (React.lazy)
- [ ] Image optimization
- [ ] Bundle size optimization

**Accessibility:**
- [ ] Keyboard shortcuts
- [ ] Focus management
- [ ] Screen reader testing
- [ ] ARIA labels audit

---

## 9. Quality Standards

### Code Quality

**TypeScript:**
- Strict mode enabled
- No `any` types (use `unknown` if necessary)
- Proper typing for all props and state

**Components:**
- Max 200 lines per component
- Single Responsibility Principle
- Reusable and composable
- Props interface at top of file

**Naming:**
- PascalCase for components
- camelCase for functions and variables
- SCREAMING_SNAKE_CASE for constants
- Descriptive names (no abbreviations)

### Performance Targets

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Lighthouse score: > 90
- Bundle size: < 500KB (initial)
- 3D viewer: 60fps with 1000+ elements

### Accessibility (WCAG 2.1 AA)

- Color contrast: 4.5:1 minimum for text
- Focus indicators visible on all interactive elements
- Keyboard navigation for all features
- ARIA labels for screen readers
- Skip navigation links

---

## 10. Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run type checking
npm run type-check

# Run linter
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Adding shadcn/ui Components

```bash
# Install a component
npx shadcn-ui@latest add button

# Component will be copied to:
# src/components/ui/button.tsx

# Customize as needed (you own the code)
```

### File Structure

```
src/
├── components/
│   ├── ui/                    # shadcn/ui components (copy-paste)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── layouts/               # Page layouts
│   │   ├── BIMViewerLayout.tsx
│   │   ├── DashboardLayout.tsx
│   │   └── Header.tsx
│   ├── bim/                   # BIM-specific components
│   │   ├── ModelTree.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── Viewer3D.tsx
│   │   └── ViewerToolbar.tsx
│   └── features/              # Feature-specific components
│       ├── upload/
│       ├── comparison/
│       └── graph/
├── lib/
│   ├── design-tokens.ts       # Design tokens (source of truth)
│   ├── api-client.ts          # Axios + React Query
│   ├── utils.ts               # Helper functions
│   └── theme-provider.tsx     # Theme context
├── hooks/
│   ├── use-models.ts          # React Query hooks
│   ├── use-theme.ts
│   └── use-keyboard.ts
├── stores/
│   ├── viewer-store.ts        # Zustand stores
│   └── ui-store.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── ProjectDetail.tsx
│   ├── ModelViewer.tsx
│   └── Comparison.tsx
└── styles/
    └── globals.css            # CSS variables, Tailwind
```

---

## 11. References

### Inspiration

- **Linear.app** - Clean dashboard, command palette, keyboard shortcuts
- **Vercel** - Deployment UX, status indicators, log streaming
- **Supabase** - Database UI, table views, SQL editor
- **Railway** - Terminal logs, real-time updates
- **Speckle** - 3D viewer layout, model tree, property panels

### Documentation

- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [React Query](https://tanstack.com/query)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Material Design Dark Theme](https://m2.material.io/design/color/dark-theme.html)

### Tools

- [Inter Font](https://rsms.me/inter/)
- [Lucide Icons](https://lucide.dev)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Can I Use](https://caniuse.com)

---

**Last Updated:** 2025-10-11
**Version:** 1.0
**Status:** Ready for implementation
