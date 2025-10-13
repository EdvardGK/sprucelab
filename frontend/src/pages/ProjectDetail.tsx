import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Calendar, Layers, AlertCircle, LayoutGrid, Table } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { useModels } from '@/hooks/use-models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModelUploadDialog } from '@/components/ModelUploadDialog';
import { ModelStatusBadge } from '@/components/ModelStatusBadge';
import { AppLayout } from '@/components/Layout/AppLayout';
import type { Model } from '@/lib/api-types';

type ViewMode = 'gallery' | 'table';

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(id!);
  const { data: allModels, isLoading: modelsLoading, error: modelsError } = useModels(id);

  // Debug logging
  console.log('[ProjectDetail] Project loading:', projectLoading, 'Models loading:', modelsLoading);
  console.log('[ProjectDetail] Project data:', project);
  console.log('[ProjectDetail] Models data:', allModels);
  console.log('[ProjectDetail] Project error:', projectError);
  console.log('[ProjectDetail] Models error:', modelsError);

  // Filter to show only the latest version of each model
  const models = useMemo(() => {
    if (!allModels) return [];

    // Group models by name
    const modelsByName = allModels.reduce((acc, model) => {
      if (!acc[model.name]) {
        acc[model.name] = [];
      }
      acc[model.name].push(model);
      return acc;
    }, {} as Record<string, Model[]>);

    // Get the latest version of each model (highest version_number)
    return Object.values(modelsByName).map(versions =>
      versions.reduce((latest, current) =>
        current.version_number > latest.version_number ? current : latest
      )
    );
  }, [allModels]);

  if (projectLoading || modelsLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="text-text-secondary">Loading project... (Project: {projectLoading ? 'loading' : 'done'}, Models: {modelsLoading ? 'loading' : 'done'})</div>
        </div>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>

          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">Project not found</h3>
            </div>
            <p className="text-sm">The project you're looking for doesn't exist or has been deleted.</p>
            {projectError && (
              <p className="text-xs mt-2">Error: {String(projectError)}</p>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (modelsError) {
    console.error('[ProjectDetail] Models loading error:', modelsError);
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text-primary">{project.name}</h1>
              {project.description && (
                <p className="text-text-secondary mt-2">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-4 text-sm text-text-tertiary">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  <span>{models?.length || 0} models</span>
                </div>
              </div>
            </div>

            <Button onClick={() => setUploadDialogOpen(true)} size="lg">
              <Upload className="mr-2 h-5 w-5" />
              Upload Model
            </Button>
          </div>
        </div>

        {/* Models section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-text-primary">IFC Models</h2>

            {/* View mode toggle */}
            {models && models.length > 0 && (
              <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
                <Button
                  variant={viewMode === 'gallery' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('gallery')}
                  className="gap-2"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Gallery
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="gap-2"
                >
                  <Table className="h-4 w-4" />
                  Table
                </Button>
              </div>
            )}
          </div>

          {/* Empty state */}
          {(!models || models.length === 0) && (
            <Card className="text-center py-12">
              <CardContent className="pt-6">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  No models uploaded yet
                </h3>
                <p className="text-text-secondary mb-6">
                  Upload your first IFC model to start analyzing and visualizing your BIM data
                </p>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload IFC Model
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Gallery view */}
          {models && models.length > 0 && viewMode === 'gallery' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {models.map((model) => (
                <Card
                  key={model.id}
                  className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50"
                  onClick={() => {
                    if (model.status === 'ready') {
                      navigate(`/models/${model.id}`);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{model.name}</CardTitle>
                        <CardDescription className="mt-1">
                          Version {model.version_number}
                        </CardDescription>
                      </div>
                      <ModelStatusBadge status={model.status} />
                    </div>
                  </CardHeader>

                  <CardContent>
                    <dl className="space-y-2 text-sm">
                      {model.status === 'ready' && (
                        <>
                          <div className="flex justify-between">
                            <dt className="text-text-secondary">Elements</dt>
                            <dd className="font-medium text-text-primary">
                              {model.element_count.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-text-secondary">Storeys</dt>
                            <dd className="font-medium text-text-primary">
                              {model.storey_count}
                            </dd>
                          </div>
                          {model.system_count > 0 && (
                            <div className="flex justify-between">
                              <dt className="text-text-secondary">Systems</dt>
                              <dd className="font-medium text-text-primary">
                                {model.system_count}
                              </dd>
                            </div>
                          )}
                        </>
                      )}

                      {model.status === 'error' && model.processing_error && (
                        <div className="text-xs text-error">
                          {model.processing_error}
                        </div>
                      )}

                      <div className="flex justify-between pt-2 border-t border-border">
                        <dt className="text-text-tertiary">Uploaded</dt>
                        <dd className="text-text-tertiary">
                          {new Date(model.created_at).toLocaleDateString()}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Table view */}
          {models && models.length > 0 && viewMode === 'table' && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Version</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">Elements</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">Storeys</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">File Size</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {models.map((model) => (
                    <tr
                      key={model.id}
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                      onClick={() => {
                        if (model.status === 'ready') {
                          navigate(`/models/${model.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">
                        {model.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        v{model.version_number}
                      </td>
                      <td className="px-4 py-3">
                        <ModelStatusBadge status={model.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        {model.status === 'ready' ? model.element_count.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        {model.status === 'ready' ? model.storey_count : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        {model.file_size ? formatFileSize(model.file_size) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-tertiary">
                        {new Date(model.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upload dialog */}
        <ModelUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          projectId={id!}
        />
      </div>
    </AppLayout>
  );
}
