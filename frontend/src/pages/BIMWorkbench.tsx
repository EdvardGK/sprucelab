import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Code2 } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeAnalysisWorkbench } from '@/components/features/warehouse/workbench/TypeAnalysisWorkbench';
import { MMITableMaker } from '@/components/features/bep/MMITableMaker';

type ViewId = 'classify' | 'bep' | 'scripting';

export default function BIMWorkbench() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: project, isLoading } = useProject(id!);

  // Classification is the default landing view (editing-only workbench)
  const activeView = (searchParams.get('view') || 'classify') as ViewId;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-text-secondary">{t('project.loadingWorkbench')}</div>
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
      <div className="flex h-full flex-col bg-background text-foreground overflow-hidden">
        {/* Content - Full height, no scrolling at container level */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'classify' && <TypeAnalysisWorkbench projectId={project.id} />}
          {activeView === 'bep' && <BEPTab projectId={project.id} />}
          {activeView === 'scripting' && <ScriptingTab projectId={project.id} />}
        </div>
      </div>
    </AppLayout>
  );
}

// BEP Configuration Tab - Now uses MMI Table Maker
function BEPTab({ projectId }: { projectId: string }) {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <MMITableMaker projectId={projectId} />
    </div>
  );
}


// Scripting Tab
function ScriptingTab({ projectId: _projectId }: { projectId: string }) {
  const { t } = useTranslation();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          {t('scriptingTab.title')}
        </h2>
        <p className="text-text-secondary">
          {t('scriptingTab.description')}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Code2 className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {t('scriptingTab.comingSoon')}
            </h3>
            <p className="text-text-secondary mb-4">
              {t('scriptingTab.comingSoonDesc')}
            </p>
            <div className="space-y-2 text-sm text-text-tertiary text-left max-w-md mx-auto">
              <p>• {t('scriptingTab.features.browse')}</p>
              <p>• {t('scriptingTab.features.upload')}</p>
              <p>• {t('scriptingTab.features.run')}</p>
              <p>• {t('scriptingTab.features.history')}</p>
              <p>• {t('scriptingTab.features.schedule')}</p>
              <p>• {t('scriptingTab.features.thirdParty')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
