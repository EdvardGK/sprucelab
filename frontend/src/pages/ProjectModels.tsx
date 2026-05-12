import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Upload } from 'lucide-react';

import { AppLayout } from '@/components/Layout/AppLayout';
import { PageShell } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ModelUploadDialog } from '@/components/ModelUploadDialog';
import { DeleteModelDialog } from '@/components/DeleteModelDialog';
import { useProject } from '@/hooks/use-projects';
import { useModels, modelKeys } from '@/hooks/use-models';
import { useProjectModelsKpis } from '@/hooks/useProjectModelsKpis';
import { ModelCard, ModelsKpiRow } from '@/components/features/project-models';
import type { Model } from '@/lib/api-types';
import apiClient from '@/lib/api-client';

/**
 * IFC Models page — project-level KPI row above a grid of tactical model
 * cards. Each card has a lazy-mounted mini 3D viewer + name/version/status
 * header + tiny KPI strip + top-3 IFC classes mini bar list.
 *
 * Layout:
 *   <PageShell>
 *     <ModelsKpiRow>           — 6 tiles, count-up + sparklines
 *     <ModelCard /> × N        — auto-fill grid, 380px min, no max-width
 *
 * Modelers-own-data: raw counts + amber em-dash for gaps. No "Mapped %".
 */
export default function ProjectModels() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [reprocessingModelId, setReprocessingModelId] = useState<string | null>(null);

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useProject(id!);
  const { data: allModels, isLoading: modelsLoading, refetch: refetchModels } = useModels(id);
  const kpis = useProjectModelsKpis(id);

  // Auto-open upload dialog on empty state — preserves the existing UX.
  useEffect(() => {
    if (!modelsLoading && allModels && allModels.length === 0) {
      setUploadDialogOpen(true);
    }
  }, [allModels, modelsLoading]);

  // Reduce to the latest version per model name (gallery rule).
  const models = useMemo(() => {
    if (!allModels) return [] as Model[];
    const byName = new Map<string, Model>();
    for (const m of allModels) {
      const existing = byName.get(m.name);
      if (!existing || m.version_number > existing.version_number) {
        byName.set(m.name, m);
      }
    }
    return [...byName.values()];
  }, [allModels]);

  const handleReprocess = async (modelId: string) => {
    setReprocessingModelId(modelId);
    // Optimistic flip — match the badge to the action immediately.
    const listKey = modelKeys.list(id);
    const previous = queryClient.getQueryData<Model[]>(listKey);
    queryClient.setQueryData<Model[]>(listKey, (current) =>
      current?.map((m) =>
        m.id === modelId ? { ...m, status: 'processing', processing_error: null } : m
      ) ?? current
    );

    try {
      await apiClient.post(`/models/${modelId}/reprocess/`);
      await refetchModels();
    } catch (error) {
      console.error('Failed to reprocess model:', error);
      if (previous) queryClient.setQueryData(listKey, previous);
    } finally {
      setReprocessingModelId(null);
    }
  };

  // --- Loading / error states ---

  if (projectLoading || modelsLoading) {
    return (
      <AppLayout>
        <PageShell title={t('projectModels.title')}>
          <div className="text-text-secondary text-sm">{t('projectModels.loading')}</div>
        </PageShell>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <PageShell title={t('projectModels.title')}>
          <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">{t('projectModels.notFound.title')}</h3>
            </div>
            <p className="text-sm">{t('projectModels.notFound.body')}</p>
            {projectError && (
              <p className="text-xs mt-2">Error: {String(projectError)}</p>
            )}
          </div>
        </PageShell>
      </AppLayout>
    );
  }

  // --- Page ---

  const uploadButton = (
    <Button onClick={() => setUploadDialogOpen(true)} size="sm">
      <Upload className="mr-2 h-4 w-4" />
      {t('projectModels.upload')}
    </Button>
  );

  return (
    <AppLayout>
      <PageShell
        title={project.name}
        subtitle={project.description || t('projectModels.title')}
        headerRight={uploadButton}
      >
        {/* Project-level KPI row */}
        <ModelsKpiRow kpis={kpis} />

        {/* Empty state */}
        {models.length === 0 ? (
          <Card className="text-center py-12 mt-[clamp(0.5rem,1vh,1rem)]">
            <CardContent className="pt-6">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {t('projectModels.empty.title')}
              </h3>
              <p className="text-text-secondary mb-6">
                {t('projectModels.empty.body')}
              </p>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t('projectModels.empty.cta')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul
            className="grid gap-[clamp(0.5rem,1vw,1rem)] grid-cols-[repeat(auto-fill,minmax(380px,1fr))] mt-[clamp(0.5rem,1vh,1rem)]"
            aria-label={t('projectModels.title')}
          >
            {models.map((model) => (
              <li key={model.id} className="list-none">
                <ModelCard
                  projectId={id!}
                  model={model}
                  onDelete={(mid, name) => setModelToDelete({ id: mid, name })}
                  onReprocess={handleReprocess}
                  reprocessing={reprocessingModelId === model.id}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Upload dialog */}
        <ModelUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          projectId={id!}
        />

        {/* Delete dialog */}
        {modelToDelete && (
          <DeleteModelDialog
            modelId={modelToDelete.id}
            modelName={modelToDelete.name}
            open={!!modelToDelete}
            onOpenChange={(open) => {
              if (!open) setModelToDelete(null);
            }}
          />
        )}
      </PageShell>
    </AppLayout>
  );
}
