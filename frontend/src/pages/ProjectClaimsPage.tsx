// Dedicated route for the existing ClaimInbox UI. This page is just the
// project-shell chrome wrapping <ClaimInbox/>; the inbox itself is unchanged.
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ClaimInbox } from '@/components/features/claims/ClaimInbox';

export default function ProjectClaimsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: project, isLoading } = useProject(id!);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
          <div className="text-error">{t('documents.projectNotFound')}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        <div className="flex-none px-[clamp(1rem,3vw,3rem)] pt-[clamp(1rem,2vw,1.5rem)] pb-[clamp(0.5rem,1vw,0.75rem)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${id}/documents`)}
            className="mb-[clamp(0.5rem,1vw,0.75rem)] -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-bold text-text-primary">
              {t('claims.pageHeading')}
            </h1>
            <span className="text-text-secondary text-[clamp(0.75rem,1.2vw,0.875rem)]">
              {project.name}
            </span>
          </div>
          <p className="text-text-secondary text-[clamp(0.75rem,1.2vw,0.875rem)] mt-1">
            {t('claims.pageSubheading')}
          </p>
        </div>
        <div className="flex-1 min-h-0 mx-[clamp(1rem,3vw,3rem)] mb-[clamp(1rem,2vw,1.5rem)] rounded-md border bg-background overflow-hidden">
          <ClaimInbox projectId={id!} />
        </div>
      </div>
    </AppLayout>
  );
}
