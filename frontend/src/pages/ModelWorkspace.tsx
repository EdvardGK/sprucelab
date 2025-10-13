import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useModel } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { ModelStatusBadge } from '@/components/ModelStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { QTODashboard } from '@/components/features/qto/QTODashboard';
import { MMIDashboard } from '@/components/features/mmi/MMIDashboard';
import { IFCViewer } from '@/components/features/viewer/IFCViewer';

// Tab definitions
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: '3d-viewer', label: '3D Viewer' },
  { id: 'qto', label: 'QTO' },
  { id: 'mmi', label: 'MMI' },
  { id: 'validation', label: 'Validation' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'properties', label: 'Properties' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'history', label: 'History' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ModelWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(id!);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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

  // Only allow access if model is ready
  const isReady = model.status === 'ready';

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated px-6 py-4">
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
                <h1 className="text-xl font-semibold text-text-primary">{model.name}</h1>
                <p className="text-sm text-text-tertiary">Version {model.version_number}</p>
              </div>
              <ModelStatusBadge status={model.status} />
            </div>
          </div>

          {/* Quick Stats */}
          {isReady && (
            <div className="flex items-center gap-6 text-sm">
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
          )}
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="border-b border-border bg-background-elevated">
        <nav className="flex px-6 space-x-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => isReady && setActiveTab(tab.id)}
              disabled={!isReady}
              className={`
                px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap
                border-b-2 -mb-px
                ${activeTab === tab.id
                  ? 'text-text-primary border-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
                }
                ${!isReady && 'opacity-50 cursor-not-allowed'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-background">
        {!isReady ? (
          <div className="flex h-full items-center justify-center">
            <Card className="max-w-md">
              <CardContent className="pt-6 text-center">
                <ModelStatusBadge status={model.status} className="mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  Model Not Ready
                </h3>
                <p className="text-text-secondary">
                  {model.status === 'processing' && 'Model is currently being processed. This may take a few minutes.'}
                  {model.status === 'uploading' && 'Model is being uploaded. Please wait...'}
                  {model.status === 'error' && `Processing failed: ${model.processing_error}`}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab model={model} />}
            {activeTab === '3d-viewer' && <Viewer3DTab model={model} />}
            {activeTab === 'qto' && <QTODashboard modelId={model.id} />}
            {activeTab === 'mmi' && <MMIDashboard modelId={model.id} />}
            {activeTab === 'validation' && <PlaceholderTab title="Validation" />}
            {activeTab === 'statistics' && <PlaceholderTab title="Statistics" />}
            {activeTab === 'properties' && <PlaceholderTab title="Properties" />}
            {activeTab === 'scripts' && <PlaceholderTab title="Scripts" />}
            {activeTab === 'metadata' && <PlaceholderTab title="Metadata" />}
            {activeTab === 'history' && <PlaceholderTab title="History" />}
          </>
        )}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ model }: { model: any }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Model Overview</h2>
        <p className="text-text-secondary">
          Quick summary of your BIM model's key metrics and information.
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-text-primary">{model.element_count.toLocaleString()}</div>
            <p className="text-xs text-text-tertiary mt-1">Total Elements</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-text-primary">{model.storey_count}</div>
            <p className="text-xs text-text-tertiary mt-1">Building Storeys</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-text-primary">{model.system_count}</div>
            <p className="text-xs text-text-tertiary mt-1">MEP Systems</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-text-primary">
              {model.ifc_schema || 'IFC4'}
            </div>
            <p className="text-xs text-text-tertiary mt-1">IFC Schema</p>
          </CardContent>
        </Card>
      </div>

      {/* Model Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Model Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-border">
              <dt className="text-text-secondary">File Name</dt>
              <dd className="text-text-primary font-medium">{model.name}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <dt className="text-text-secondary">Version</dt>
              <dd className="text-text-primary font-medium">{model.version_number}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <dt className="text-text-secondary">Upload Date</dt>
              <dd className="text-text-primary font-medium">
                {new Date(model.created_at).toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <dt className="text-text-secondary">Status</dt>
              <dd>
                <ModelStatusBadge status={model.status} />
              </dd>
            </div>
            {model.processing_time && (
              <div className="flex justify-between py-2 border-b border-border">
                <dt className="text-text-secondary">Processing Time</dt>
                <dd className="text-text-primary font-medium">{model.processing_time}s</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="justify-start">
              View in 3D
            </Button>
            <Button variant="outline" className="justify-start">
              Run QTO Analysis
            </Button>
            <Button variant="outline" className="justify-start">
              Check MMI
            </Button>
            <Button variant="outline" className="justify-start">
              Validate Model
            </Button>
            <Button variant="outline" className="justify-start">
              Export Data
            </Button>
            <Button variant="outline" className="justify-start">
              Run Scripts
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 3D Viewer Tab Component
function Viewer3DTab({ model }: { model: any }) {
  return (
    <div className="flex h-full">
      {/* Model tree (left panel) */}
      <aside className="w-64 border-r border-border bg-background p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Model Tree</h2>
        <div className="text-xs text-text-secondary mb-4">
          {model.element_count.toLocaleString()} elements
        </div>

        {/* Placeholder tree structure */}
        <div className="space-y-1 text-xs">
          <div className="font-medium text-text-primary py-1">📁 Project</div>
          <div className="pl-4 space-y-1">
            <div className="font-medium text-text-primary py-1">📁 Site</div>
            <div className="pl-4 space-y-1">
              <div className="font-medium text-text-primary py-1">🏢 Building</div>
              <div className="pl-4 space-y-1">
                {Array.from({ length: model.storey_count || 3 }, (_, i) => (
                  <div key={i} className="text-text-secondary py-1 hover:text-text-primary cursor-pointer">
                    📐 Storey {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs text-text-tertiary">
          Tree view coming soon...
        </div>
      </aside>

      {/* 3D viewer (center panel) */}
      <main className="flex-1 relative">
        <IFCViewer modelId={model.id} />
      </main>

      {/* Properties panel (right panel) */}
      <aside className="w-80 border-l border-border bg-background p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Properties</h2>
        <div className="text-sm text-text-secondary mb-4">
          Select an element to view its properties
        </div>

        {/* Placeholder properties */}
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-text-tertiary mb-2">BASIC INFO</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Type:</span>
                <span className="text-text-primary">IfcWall</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Name:</span>
                <span className="text-text-primary">Wall-001</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">GUID:</span>
                <span className="text-text-primary font-mono">1a2b3c...</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-text-tertiary mb-2">DIMENSIONS</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Width:</span>
                <span className="text-text-primary">200 mm</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Height:</span>
                <span className="text-text-primary">3000 mm</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Length:</span>
                <span className="text-text-primary">5000 mm</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-text-tertiary mt-4">
            Full properties panel coming soon...
          </div>
        </div>
      </aside>
    </div>
  );
}

// Placeholder Tab Component
function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {title} - Coming Soon
          </h3>
          <p className="text-text-secondary">
            This feature is under development and will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
