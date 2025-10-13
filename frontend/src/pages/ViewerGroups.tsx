import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Layers, LayoutGrid, Table } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useProject } from '@/hooks/use-projects';
import { useViewerGroups } from '@/hooks/use-viewer-groups';
import { CreateGroupDialog } from '@/components/CreateGroupDialog';

type ViewMode = 'gallery' | 'table';

export default function ViewerGroups() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoading: projectLoading } = useProject(id!);
  const { data: groups, isLoading: groupsLoading } = useViewerGroups(id);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');

  const isLoading = projectLoading || groupsLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="max-w-7xl w-full mx-auto">
            <div className="text-text-secondary">Loading...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        <div className="max-w-7xl w-full mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-text-primary mb-2">3D Viewer Groups</h1>
            <p className="text-text-secondary">
              Organize models into groups for federated viewing
            </p>
          </div>

          {/* Header with Create button and View toggle */}
          <div className="flex items-center justify-between mb-6">
            <Button onClick={() => setCreateGroupOpen(true)} size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Create Group
            </Button>

            {/* View mode toggle */}
            {groups && groups.length > 0 && (
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
          {(!groups || groups.length === 0) && (
            <Card className="text-center py-12">
              <CardContent className="pt-6">
                <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  No groups yet
                </h3>
                <p className="text-text-secondary mb-6">
                  Create your first group to organize models for federated viewing
                </p>
                <Button onClick={() => setCreateGroupOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Group
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Gallery view */}
          {groups && groups.length > 0 && viewMode === 'gallery' && (
            <ul className="grid grid-cols-1 gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 pb-6">
              {groups.map((group) => (
                <li key={group.id} className="list-none">
                  <div
                    className="group relative bg-surface border border-border rounded-md p-5 flex flex-col transition-all duration-150 cursor-pointer hover:bg-surface/80 hover:border-primary/50 h-44 pt-5 pb-0"
                    onClick={() => navigate(`/projects/${id}/viewer/${group.id}`)}
                  >
                    {/* Top section: Icon, Name, Description */}
                    <div className="flex flex-col space-y-1.5 px-0">
                      <div className="flex items-start gap-2">
                        <Layers className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <p className="text-sm font-medium text-text-primary truncate pr-8">
                          {group.name}
                        </p>
                      </div>

                      {group.description && (
                        <p className="text-xs text-text-secondary line-clamp-2 pl-6">
                          {group.description}
                        </p>
                      )}

                      {/* Stats - compact single line */}
                      <div className="flex items-center gap-3 text-xs text-text-tertiary pt-1 pl-6">
                        <span>{group.model_count} {group.model_count === 1 ? 'model' : 'models'}</span>
                      </div>
                    </div>

                    {/* Bottom section: Creation date */}
                    <div className="mt-auto w-full">
                      <div className="text-xs text-text-tertiary pb-4 space-y-0.5">
                        <div>Created {new Date(group.created_at).toLocaleDateString()}</div>
                        {group.updated_at !== group.created_at && (
                          <div>Updated {new Date(group.updated_at).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>

                    {/* Chevron indicator */}
                    <div className="absolute right-4 top-4 text-text-tertiary transition-all duration-200 group-hover:right-3 group-hover:text-text-primary">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Table view */}
          {groups && groups.length > 0 && viewMode === 'table' && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-text-primary">Models</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Created</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Updated</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      className="cursor-pointer hover:bg-surface/50 transition-colors"
                      onClick={() => navigate(`/projects/${id}/viewer/${group.id}`)}
                    >
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          {group.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {group.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-right">
                        {group.model_count}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-tertiary">
                        {new Date(group.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-tertiary">
                        {new Date(group.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        projectId={id!}
      />
    </AppLayout>
  );
}
