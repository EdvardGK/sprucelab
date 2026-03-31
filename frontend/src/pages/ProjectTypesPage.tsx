import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeBrowser } from '@/components/features/warehouse/TypeBrowser';
import { useProject } from '@/hooks/use-projects';

export default function ProjectTypesPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id!);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-destructive">{t('project.notFound')}</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] overflow-hidden px-6 md:px-8 lg:px-12 py-6">
        <TypeBrowser projectId={project.id} className="h-full" />
      </div>
    </AppLayout>
  );
}
