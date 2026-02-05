import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Code2, Package } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';
import { TypeLibraryPanel } from '@/components/features/warehouse/TypeLibraryPanel';
import { TypeDashboard } from '@/components/features/warehouse/TypeDashboard';
import { MMITableMaker } from '@/components/features/bep/MMITableMaker';

type ViewId = 'dashboard' | 'types' | 'materials' | 'stats' | 'bep' | 'scripting';

export default function BIMWorkbench() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: project, isLoading } = useProject(id!);

  // Dashboard is the default landing view
  const activeView = (searchParams.get('view') || 'dashboard') as ViewId;

  // Handler for navigating to type list for a specific model
  const handleModelSelect = (modelId: string) => {
    setSearchParams({ view: 'types', model: modelId });
  };

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
          {activeView === 'dashboard' && (
            <TypeDashboard
              projectId={project.id}
              onModelSelect={handleModelSelect}
            />
          )}
          {activeView === 'types' && <TypeLibraryPanel projectId={project.id} />}
          {activeView === 'materials' && <MaterialLibraryPanel projectId={project.id} />}
          {activeView === 'stats' && <MappingStatsPanel projectId={project.id} />}
          {activeView === 'bep' && <BEPTab projectId={project.id} />}
          {activeView === 'scripting' && <ScriptingTab projectId={project.id} />}
        </div>
      </div>
    </AppLayout>
  );
}

// Material Library Panel (placeholder - to be implemented)
function MaterialLibraryPanel({ projectId: _projectId }: { projectId: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{t('materials.title')}</h2>
          <p className="text-text-secondary text-sm">
            {t('materials.description')}
          </p>
        </div>
        <Button variant="outline" size="sm">
          {t('materials.importCsv')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('materials.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {t('materials.noMaterials')}
            </h3>
            <p className="text-text-secondary mb-4">
              {t('materials.noMaterialsDesc')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// Mapping Stats Panel (placeholder - to be implemented with real data)
function MappingStatsPanel({ projectId: _projectId }: { projectId: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{t('stats.title')}</h2>
        <p className="text-text-secondary text-sm">
          {t('stats.description')}
        </p>
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('stats.typeMapping')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden mb-2">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-500"
                style={{ width: '0%' }}
              />
            </div>
            <p className="text-sm text-text-tertiary">0% {t('stats.complete')} (0/0 {t('common.types')})</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('stats.materialMapping')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden mb-2">
              <div
                className="bg-success h-3 rounded-full transition-all duration-500"
                style={{ width: '0%' }}
              />
            </div>
            <p className="text-sm text-text-tertiary">0% {t('stats.complete')} (0/0 materials)</p>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('stats.exportData')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="outline" disabled>
              {t('stats.exportTypesCsv')}
            </Button>
            <Button variant="outline" disabled>
              {t('stats.exportMaterialsCsv')}
            </Button>
            <Button variant="outline" disabled>
              {t('stats.exportFullReport')}
            </Button>
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            {t('stats.completeToExport')}
          </p>
        </CardContent>
      </Card>
    </div>
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
