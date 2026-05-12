// Dedicated route for the existing ClaimInbox UI. Session 8 added the
// canonical PageShell chrome + a project-level KPI row above the inbox
// so the page reads consistently with Models, Materials and Types.
//
// The inbox itself owns its tactical workspace (list-left / detail-right,
// filter bar, keyboard nav). PageShell wraps it; the KPI row sits between
// the chrome header and the inbox card.
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useProject } from '@/hooks/use-projects';
import { useProjectClaimsKpis } from '@/hooks/useClaimsKpis';
import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { ClaimInbox } from '@/components/features/claims/ClaimInbox';
import { ClaimsKpiRow } from '@/components/features/claims/ClaimsKpiRow';

export default function ProjectClaimsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: project, isLoading } = useProject(id!);
  const kpis = useProjectClaimsKpis(id);

  if (isLoading) {
    return (
      <AppLayout>
        <PageShell title={t('claims.pageHeading')}>
          <div className="text-text-secondary text-sm">{t('common.loading')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <PageShell title={t('claims.pageHeading')}>
          <div className="text-error text-sm">{t('documents.projectNotFound')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageShell
        title={t('claims.pageHeading')}
        subtitle={project.name}
      >
        <ClaimsKpiRow kpis={kpis} />

        {/* The ClaimInbox is the tactical workspace: list + detail, filter
            bar, keyboard nav. We wrap it in a bordered card so it reads
            as one cohesive surface inside the PageShell padding. The
            inbox owns its own scroll; the page scrolls naturally below
            the KPI row when the viewport is short. */}
        <div className="rounded-md border bg-background min-h-[clamp(28rem,60vh,48rem)] flex flex-col overflow-hidden mt-[clamp(0.5rem,1vh,1rem)]">
          <ClaimInbox projectId={id!} />
        </div>
      </PageShell>
    </AppLayout>
  );
}
