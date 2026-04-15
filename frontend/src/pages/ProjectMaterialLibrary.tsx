import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { MaterialBrowserView } from '@/components/features/materials/MaterialBrowserView';
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
      <MaterialBrowserView projectId={project.id} />
    </AppLayout>
  );
}
