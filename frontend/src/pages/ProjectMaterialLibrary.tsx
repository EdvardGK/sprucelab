import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { useProject } from '@/hooks/use-projects';

export default function ProjectMaterialLibrary() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-text-secondary">{t('common.loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-error">{t('project.notFound')}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-full flex-col items-center justify-center gap-4 text-text-secondary">
        <Box className="h-16 w-16 opacity-50" />
        <h2 className="text-xl font-semibold">{t('materialLibrary.title')}</h2>
        <p className="text-sm">{t('materialLibrary.comingSoon')}</p>
      </div>
    </AppLayout>
  );
}
