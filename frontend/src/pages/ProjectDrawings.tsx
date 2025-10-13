import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Image, Upload } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';

export default function ProjectDrawings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id!);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="max-w-7xl w-full mx-auto">
            <div className="text-text-secondary">Loading project...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="max-w-7xl w-full mx-auto">
            <div className="text-error">Project not found</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        {/* Header */}
        <div className="mb-8 max-w-7xl w-full mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${id}`)}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text-primary">Drawings</h1>
              <p className="text-text-secondary mt-2">{project.name}</p>
            </div>

            <Button size="lg">
              <Upload className="mr-2 h-5 w-5" />
              Upload Drawing
            </Button>
          </div>
        </div>

        {/* Drawings section */}
        <div className="max-w-7xl w-full mx-auto">
          <Card className="text-center py-12">
            <CardContent className="pt-6">
              <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Drawings Module Coming Soon
              </h3>
              <p className="text-text-secondary mb-6">
                Upload and manage architectural drawings, floor plans, and sections
              </p>
              <div className="space-y-2 text-sm text-text-tertiary text-left max-w-md mx-auto">
                <p>• Upload PDF drawings and DWG files</p>
                <p>• Organize by discipline and drawing set</p>
                <p>• Link drawings to models and building elements</p>
                <p>• Version control and revision tracking</p>
                <p>• Compare drawing revisions</p>
                <p>• Extract drawing metadata</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
