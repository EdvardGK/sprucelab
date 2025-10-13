import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useModel } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { ModelStatusBadge } from '@/components/ModelStatusBadge';

export default function ModelViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(id!);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex h-screen items-center justify-center">
          <div className="text-text-secondary">Loading model...</div>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex h-screen items-center justify-center">
          <div className="text-error">Model not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-lg font-semibold text-text-primary">{model.name}</h1>
                <p className="text-sm text-text-tertiary">Version {model.version_number}</p>
              </div>
              <ModelStatusBadge status={model.status} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Fullscreen">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content - 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Model tree (left panel) */}
        <aside className="w-64 border-r border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Model Tree</h2>
          <div className="text-xs text-text-secondary">
            {model.element_count.toLocaleString()} elements
          </div>
          {/* TODO: Add model tree component */}
        </aside>

        {/* 3D viewer (center panel) */}
        <main className="flex-1 bg-background-elevated">
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-text-secondary mb-4">3D Viewer</p>
              <p className="text-sm text-text-tertiary">
                Three.js viewer coming soon...
              </p>
            </div>
          </div>
          {/* TODO: Add Three.js viewer component */}
        </main>

        {/* Properties panel (right panel) */}
        <aside className="w-80 border-l border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Properties</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-text-secondary">Elements:</span>{' '}
              <span className="text-text-primary font-medium">
                {model.element_count.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-text-secondary">Storeys:</span>{' '}
              <span className="text-text-primary font-medium">{model.storey_count}</span>
            </div>
            {model.system_count > 0 && (
              <div>
                <span className="text-text-secondary">Systems:</span>{' '}
                <span className="text-text-primary font-medium">{model.system_count}</span>
              </div>
            )}
          </div>
          {/* TODO: Add property panel component */}
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-background-elevated px-4 py-2">
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <div>Selected: None</div>
          <div>Uploaded {new Date(model.created_at).toLocaleDateString()}</div>
        </div>
      </footer>
    </div>
  );
}
