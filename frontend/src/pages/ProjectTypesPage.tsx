import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeBrowserV2 } from '@/components/features/warehouse-v2/TypeBrowserV2';
import { useProject } from '@/hooks/use-projects';

// Legacy v1 (`components/features/warehouse/TypeBrowser`) is intentionally
// no longer mounted. The folder is kept as deprecated reference until the
// v2 rollout has soaked; do not re-import without removing first.
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
      <TypeBrowserV2 projectId={project.id} />
    </AppLayout>
  );
}
