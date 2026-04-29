import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ClaimInbox } from '@/components/features/claims/ClaimInbox';

export default function ProjectDocuments() {
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
          <div className="text-error">Project not found</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        <div className="flex-none px-6 md:px-8 lg:px-12 pt-6 pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/projects/${id}`)}
            className="mb-3 -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-text-primary">{t('claims.pageHeading')}</h1>
            <span className="text-text-secondary text-sm">{project.name}</span>
          </div>
          <p className="text-text-secondary text-sm mt-1">{t('claims.pageSubheading')}</p>
        </div>
        <div className="flex-1 min-h-0 mx-6 md:mx-8 lg:mx-12 mb-6 rounded-md border bg-background overflow-hidden">
          <ClaimInbox projectId={id!} />
        </div>
      </div>
    </AppLayout>
  );
}
