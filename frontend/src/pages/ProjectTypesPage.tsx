import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeBrowser } from '@/components/features/warehouse/TypeBrowser';
import { TypeBrowserV2 } from '@/components/features/warehouse-v2/TypeBrowserV2';
import { useProject } from '@/hooks/use-projects';

export default function ProjectTypesPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: project, isLoading } = useProject(id!);

  const useV2 = searchParams.get('v') === '2';

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

  if (useV2) {
    return (
      <AppLayout>
        <TypeBrowserV2 projectId={project.id} />
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
