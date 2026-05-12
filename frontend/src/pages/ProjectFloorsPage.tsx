import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useProject } from '@/hooks/use-projects';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { ProjectFloorsTab } from '@/components/features/projects/ProjectFloorsTab';

/**
 * Project Floors — top-level surface for canonical floor management.
 *
 * Lifted out of the old ProjectDashboard inner Tabs in Session 7 so the
 * sidebar (not in-page tabs) owns navigation between project surfaces.
 * The page is a thin PageShell wrapper around `<ProjectFloorsTab>` —
 * the data + editor live inside that component unchanged.
 */
export default function ProjectFloorsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id ?? '');

  if (!id) return null;

  return (
    <AppLayout>
      <PageShell
        title={t('floors.tab')}
        subtitle={project?.name}
      >
        <ProjectFloorsTab projectId={id} />
      </PageShell>
    </AppLayout>
  );
}
