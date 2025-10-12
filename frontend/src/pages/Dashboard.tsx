import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { LoadingCard } from '@/components/LoadingCard';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: projects, isLoading, error } = useProjects();
  const navigate = useNavigate();

  // Debug logging
  console.log('[Dashboard] Render state:', {
    projects,
    projectsLength: projects?.length,
    isLoading,
    error,
    isArray: Array.isArray(projects),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto p-6">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text-primary">Projects</h1>
              <p className="text-text-secondary mt-2">Manage your BIM coordination projects</p>
            </div>
            <Button size="lg" disabled>
              <Plus className="mr-2 h-5 w-5" />
              New Project
            </Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-4xl font-bold text-text-primary">Projects</h1>
            <p className="text-text-secondary mt-2">Manage your BIM coordination projects</p>
          </div>
          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <h3 className="font-semibold mb-2">Error loading projects</h3>
            <p className="text-sm">{error.message}</p>
            <p className="text-sm mt-2 text-text-tertiary">
              Make sure the Django backend is running at http://127.0.0.1:8000/
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">Projects</h1>
            <p className="text-text-secondary mt-2">Manage your BIM coordination projects</p>
          </div>

          <Button onClick={() => setCreateDialogOpen(true)} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            New Project
          </Button>
        </div>

        {/* Empty state */}
        {projects && projects.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <h3 className="text-xl font-semibold text-text-primary mb-2">No projects yet</h3>
            <p className="text-text-secondary mb-6">
              Create your first project to start managing BIM models
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
        )}

        {/* Project grid */}
        {projects && projects.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                    <Badge variant="outline" className="ml-2">
                      {project.model_count || 0} models
                    </Badge>
                  </div>
                  {project.description && (
                    <CardDescription className="mt-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Created</dt>
                      <dd className="text-text-tertiary">
                        {new Date(project.created_at).toLocaleDateString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-text-secondary">Last updated</dt>
                      <dd className="text-text-tertiary">
                        {new Date(project.updated_at).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create project dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
