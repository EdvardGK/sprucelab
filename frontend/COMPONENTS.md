# Component Reference Guide

Complete reference for all components in the BIM Coordinator Platform frontend.

---

## UI Components (shadcn/ui)

### Button
**Location**: `src/components/ui/button.tsx`

```tsx
import { Button } from '@/components/ui/button';

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon">Icon</Button>
```

### Card
**Location**: `src/components/ui/card.tsx`

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    Footer content
  </CardFooter>
</Card>
```

### Input
**Location**: `src/components/ui/input.tsx`

```tsx
import { Input } from '@/components/ui/input';

<Input type="text" placeholder="Enter text" />
<Input type="email" placeholder="Email" />
<Input type="password" placeholder="Password" />
```

### Label
**Location**: `src/components/ui/label.tsx`

```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="input-id">Label Text</Label>
<Input id="input-id" />
```

### Dialog
**Location**: `src/components/ui/dialog.tsx`

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Content</div>
    <DialogFooter>
      <Button onClick={() => setOpen(false)}>Close</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Badge
**Location**: `src/components/ui/badge.tsx`

```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="info">Info</Badge>
```

### Alert
**Location**: `src/components/ui/alert.tsx`

```tsx
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

<Alert variant="default">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>
    You can add components to your app using the CLI.
  </AlertDescription>
</Alert>

// Variants: default, destructive, success, warning, info
```

### Progress
**Location**: `src/components/ui/progress.tsx`

```tsx
import { Progress } from '@/components/ui/progress';

<Progress value={60} /> // 60%
```

### Skeleton
**Location**: `src/components/ui/skeleton.tsx`

```tsx
import { Skeleton } from '@/components/ui/skeleton';

<Skeleton className="h-4 w-full" />
<Skeleton className="h-10 w-10 rounded-full" />
```

### Separator
**Location**: `src/components/ui/separator.tsx`

```tsx
import { Separator } from '@/components/ui/separator';

<Separator /> // Horizontal
<Separator orientation="vertical" /> // Vertical
```

### Tooltip
**Location**: `src/components/ui/tooltip.tsx`

```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>
      <p>Tooltip content</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Textarea
**Location**: `src/components/ui/textarea.tsx`

```tsx
import { Textarea } from '@/components/ui/textarea';

<Textarea placeholder="Enter description" rows={4} />
```

---

## Custom Components

### ModelUploadDialog
**Location**: `src/components/ModelUploadDialog.tsx`

Drag-and-drop file upload dialog for IFC models.

```tsx
import { ModelUploadDialog } from '@/components/ModelUploadDialog';

<ModelUploadDialog
  open={open}
  onOpenChange={setOpen}
  projectId="project-uuid"
/>
```

**Features**:
- Drag-and-drop file upload
- File validation (IFC only, max 1GB)
- Auto-fill model name from filename
- Version number input
- Upload progress indicator
- Error handling

### ModelStatusBadge
**Location**: `src/components/ModelStatusBadge.tsx`

Status indicator badge with icons.

```tsx
import { ModelStatusBadge } from '@/components/ModelStatusBadge';

<ModelStatusBadge status="ready" />
<ModelStatusBadge status="processing" />
<ModelStatusBadge status="uploading" />
<ModelStatusBadge status="error" />
```

**Statuses**:
- `uploading` - Upload in progress (animated icon)
- `processing` - Model being processed (animated spinner)
- `ready` - Model ready to view (green checkmark)
- `error` - Processing failed (red X)

### CreateProjectDialog
**Location**: `src/components/CreateProjectDialog.tsx`

Dialog for creating new projects.

```tsx
import { CreateProjectDialog } from '@/components/CreateProjectDialog';

<CreateProjectDialog
  open={open}
  onOpenChange={setOpen}
/>
```

### LoadingCard
**Location**: `src/components/LoadingCard.tsx`

Skeleton loader for project/model cards.

```tsx
import { LoadingCard } from '@/components/LoadingCard';

<LoadingCard />
```

### EmptyState
**Location**: `src/components/EmptyState.tsx`

Generic empty state component.

```tsx
import { EmptyState } from '@/components/EmptyState';
import { Upload } from 'lucide-react';

<EmptyState
  icon={Upload}
  title="No models yet"
  description="Upload your first IFC model to get started"
  actionLabel="Upload Model"
  onAction={() => setUploadOpen(true)}
/>
```

### ErrorBoundary
**Location**: `src/components/ErrorBoundary.tsx`

React error boundary for catching errors.

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## Hooks

### useProjects
**Location**: `src/hooks/use-projects.ts`

```tsx
import { useProjects, useProject, useCreateProject, useUpdateProject, useDeleteProject } from '@/hooks/use-projects';

const { data: projects, isLoading, error } = useProjects();
const { data: project } = useProject(id);
const createProject = useCreateProject();
const updateProject = useUpdateProject();
const deleteProject = useDeleteProject();

// Create project
await createProject.mutateAsync({
  name: 'My Project',
  description: 'Optional description'
});
```

### useModels
**Location**: `src/hooks/use-models.ts`

```tsx
import { useModels, useModel, useModelStatus, useUploadModel } from '@/hooks/use-models';

const { data: models } = useModels(projectId);
const { data: model } = useModel(id);
const { data: status } = useModelStatus(id); // Auto-polls when processing
const uploadModel = useUploadModel();

// Upload model
await uploadModel.mutateAsync({
  file: file,
  project_id: projectId,
  name: 'Building Model',
  version_number: '1.0'
});
```

### useToast
**Location**: `src/hooks/use-toast.ts`

```tsx
import { useToast } from '@/hooks/use-toast';

const { toast, success, error, warning } = useToast();

// Usage
toast({ title: 'Success', description: 'Action completed' });
success('Success!', 'Optional description');
error('Error!', 'Something went wrong');
warning('Warning', 'Please check this');
```

---

## Utilities

### Design Tokens
**Location**: `src/lib/design-tokens.ts`

```tsx
import { tokens } from '@/lib/design-tokens';

// Access tokens
tokens.color.background.base // '#0a0f14'
tokens.typography.fontSize.base // '1rem'
tokens.spacing[4] // '1rem'
tokens.radius.md // '0.375rem'
```

### Format Utilities
**Location**: `src/lib/format.ts`

```tsx
import { formatFileSize, formatNumber, formatDate, formatDateTime, formatRelativeTime, truncate } from '@/lib/format';

formatFileSize(1024000) // '1000.0 KB'
formatNumber(1234567) // '1,234,567'
formatDate('2025-01-01') // 'Jan 1, 2025'
formatDateTime('2025-01-01T12:00:00') // 'Jan 1, 2025, 12:00 PM'
formatRelativeTime('2025-01-01') // '2 hours ago'
truncate('Long text...', 20) // 'Long text...'
```

### Class Name Utilities
**Location**: `src/lib/utils.ts`

```tsx
import { cn } from '@/lib/utils';

// Merge Tailwind classes safely
<div className={cn('bg-background', isActive && 'bg-primary')} />
```

---

## Icons

Using **Lucide React** for all icons:

```tsx
import { Upload, Download, Trash, Edit, Plus, X, Check, AlertCircle, Loader2 } from 'lucide-react';

<Upload className="h-4 w-4" />
<Loader2 className="h-4 w-4 animate-spin" />
```

**Common icons**:
- `Upload`, `Download` - File operations
- `Plus`, `X`, `Check` - Actions
- `AlertCircle`, `Info`, `CheckCircle` - Status
- `Loader2` - Loading spinner
- `ArrowLeft`, `ArrowRight` - Navigation
- `Settings`, `Menu` - UI controls
- `Eye`, `EyeOff` - Visibility
- `Trash`, `Edit`, `Copy` - CRUD operations

---

## Color System

### Background
- `bg-background` - Base background (#0a0f14)
- `bg-background-elevated` - Elevated surface (#141b22)
- `bg-background-overlay` - Overlay (#1f2933)

### Text
- `text-text-primary` - Primary text (#fafafa)
- `text-text-secondary` - Secondary text (#cbd5e0)
- `text-text-tertiary` - Tertiary/disabled (#a0aec0)

### Semantic
- `text-success`, `bg-success` - Green (#48bb78)
- `text-warning`, `bg-warning` - Orange (#ed8936)
- `text-error`, `bg-error` - Red (#fc8181)
- `text-info`, `bg-info` - Blue (#4299e1)

### Brand
- `text-brand-ocean-500`, `bg-brand-ocean-500` - Primary (#1890ff)
- `text-brand-forest-500`, `bg-brand-forest-500` - Secondary (#33a070)
- `text-brand-mint`, `bg-brand-mint` - Accent (#5dffca)
- `text-brand-cyan`, `bg-brand-cyan` - Accent (#5ddfff)

---

## Spacing Scale

Based on 8px grid:

- `p-1` = 4px
- `p-2` = 8px
- `p-3` = 12px
- `p-4` = 16px
- `p-6` = 24px
- `p-8` = 32px

Same for margin (`m-*`), gap (`gap-*`), etc.

---

## Responsive Breakpoints

- `sm:` - 640px (tablet)
- `md:` - 768px (tablet landscape)
- `lg:` - 1024px (laptop)
- `xl:` - 1280px (desktop)
- `2xl:` - 1536px (large desktop)

```tsx
// Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

For more details, see the [Frontend README](./README.md) and [Design System Spec](../project-management/planning/frontend-design-system.md).
