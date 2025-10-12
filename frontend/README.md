# BIM Coordinator Platform - Frontend

React + TypeScript + Vite frontend for the BIM Coordinator Platform.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v3 + Design Tokens
- **UI Components**: Radix UI + shadcn/ui (copy-paste pattern)
- **State Management**:
  - Client state: Zustand
  - Server state: Tanstack Query (React Query)
- **API Client**: Axios
- **Routing**: React Router v6
- **Icons**: Lucide React

## Design System

Based on Linear/Vercel/Supabase dark minimalism pattern:
- Dark gray backgrounds (#0a0f14, not pure black)
- Desaturated accent colors for dark mode
- Off-white text (#fafafa, not pure white)
- 8px spacing grid
- Zero hardcoding via design tokens

See `/project-management/planning/frontend-design-system.md` for full specification.

## Getting Started

### Prerequisites

- Node.js 18+ (currently using v21.7.3)
- Yarn package manager
- Django backend running at http://127.0.0.1:8000/

### Installation

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

The frontend will be available at http://localhost:5173

### Available Scripts

```bash
yarn dev         # Start dev server (port 5173)
yarn build       # Build for production
yarn preview     # Preview production build
yarn lint        # Run ESLint
yarn type-check  # Run TypeScript type checking
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   └── CreateProjectDialog.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx          # Project list page
│   │   └── ProjectDetail.tsx      # Project detail page
│   ├── hooks/
│   │   ├── use-projects.ts        # React Query hooks for projects
│   │   └── use-models.ts          # React Query hooks for models
│   ├── lib/
│   │   ├── design-tokens.ts       # Design system tokens
│   │   ├── api-client.ts          # Axios instance
│   │   ├── api-types.ts           # TypeScript types for API
│   │   ├── query-client.ts        # React Query client
│   │   └── utils.ts               # Utility functions (cn helper)
│   ├── styles/
│   │   └── globals.css            # Global styles + Tailwind
│   ├── App.tsx                    # Root component with routing
│   └── main.tsx                   # Entry point
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── postcss.config.js
```

## Components

### shadcn/ui Components (Copied)

- **Button** - Primary UI element with variants
- **Card** - Content containers with header/content/footer
- **Input** - Form inputs with proper styling
- **Dialog** - Modal dialogs with overlay
- **Badge** - Status indicators with variants
- **Skeleton** - Loading placeholders
- **Separator** - Horizontal/vertical dividers

More components can be added from [shadcn/ui](https://ui.shadcn.com) as needed.

### Custom Components

- **CreateProjectDialog** - Dialog for creating new projects
- **ModelUploadDialog** - Drag-and-drop file upload with validation
- **ModelStatusBadge** - Status indicator with icons (uploading/processing/ready/error)
- **LoadingCard** - Skeleton loader for project/model cards

## API Integration

The frontend connects to the Django backend via proxy (configured in `vite.config.ts`):

```typescript
// All /api/* requests are proxied to http://127.0.0.1:8000/api/*
const response = await apiClient.get('/projects/');  // -> http://127.0.0.1:8000/api/projects/
```

### React Query Hooks

**Projects:**
- `useProjects()` - Fetch all projects
- `useProject(id)` - Fetch single project
- `useCreateProject()` - Create project mutation
- `useUpdateProject()` - Update project mutation
- `useDeleteProject()` - Delete project mutation

**Models:**
- `useModels(projectId)` - Fetch models for a project
- `useModel(id)` - Fetch single model
- `useModelStatus(id)` - Fetch model status (with polling)
- `useUploadModel()` - Upload model mutation

## Current Features

### Dashboard Page (/)

- ✅ List all projects with responsive grid
- ✅ Create new project via dialog
- ✅ Empty state when no projects
- ✅ Project cards with metadata and hover effects
- ✅ Skeleton loading states
- ✅ Click to navigate to project detail

### Project Detail Page (/projects/:id)

- ✅ Show project name, description, and metadata
- ✅ Upload IFC models via drag-and-drop dialog
- ✅ List models with status badges (uploading/processing/ready/error)
- ✅ Model cards showing element count, storeys, systems
- ✅ Empty state when no models
- ✅ Click on ready models to open viewer
- ✅ Back navigation to dashboard

### Model Viewer Page (/models/:id)

- ✅ 3-panel layout (tree, viewer, properties)
- ✅ Header with model name, version, status
- ✅ Toolbar with zoom controls
- ✅ Model tree sidebar (placeholder)
- ✅ 3D viewer area (placeholder for Three.js)
- ✅ Properties panel with model stats
- ✅ Footer with selection info

### Model Upload

- ✅ Drag-and-drop file upload
- ✅ File validation (IFC only, max 1GB)
- ✅ Auto-fill model name from filename
- ✅ Version number input
- ✅ Upload progress indicator
- ✅ Error handling with helpful messages
- ✅ File size display

### Design System

- ✅ Dark minimalism theme
- ✅ Design tokens system
- ✅ Tailwind CSS configured
- ✅ shadcn/ui components integrated
- ✅ Inter font loaded from Google Fonts

## Next Steps

### Immediate (Phase 2) - In Progress

- [x] Model upload component with drag-and-drop
- [x] Model status indicator with polling
- [x] 3-panel viewer layout
- [ ] 3D viewer integration (Three.js) - Dependencies added
- [ ] Model tree component - Basic structure ready
- [ ] Property panel component - Basic structure ready
- [ ] Resizable panels (react-resizable-panels)

### Future (Phase 3+)

- [ ] Graph visualization (react-force-graph-3d)
- [ ] Change detection UI
- [ ] Command palette (Cmd+K)
- [ ] Keyboard shortcuts
- [ ] Search and filter
- [ ] Export functionality

## Development Notes

### Backend Required

The Django backend must be running for the frontend to work:

```bash
cd ../backend
conda activate sprucelab
python manage.py runserver
```

### API Proxy

Vite is configured to proxy `/api/*` requests to the Django backend. This avoids CORS issues during development.

### Dark Mode

The app is dark mode only (for now). The `dark` class is added to the `<html>` element in `index.html`.

### TypeScript

All components and hooks are fully typed. The `strict` mode is enabled in `tsconfig.json`.

## Troubleshooting

### "Cannot connect to backend"

- Make sure Django is running at http://127.0.0.1:8000/
- Check the browser console for CORS errors
- Verify the proxy configuration in `vite.config.ts`

### "Module not found"

- Run `yarn install` to ensure all dependencies are installed
- Check import paths use `@/` alias (configured in vite.config.ts)

### "Build errors"

- Run `yarn type-check` to see TypeScript errors
- Run `yarn lint` to see ESLint errors

## Resources

- [Design System Spec](../project-management/planning/frontend-design-system.md)
- [Backend Architecture](../project-management/planning/session-002-bim-coordinator-platform.md)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com)
- [React Query](https://tanstack.com/query)
