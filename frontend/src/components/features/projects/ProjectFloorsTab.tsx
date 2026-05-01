/**
 * ProjectFloorsTab — F-3 view of canonical floors + per-model deviations
 * + a thin verification-gate editor.
 *
 * Data sources:
 *   - useProjectScopes(projectId)    → list + root scope
 *   - useScopeFloors(rootScopeId)    → canonical floors + deviating models
 *   - apiClient PATCH /projects/configs/{id}/  → update block_on_storey_deviation
 *   - apiClient PATCH /projects/scopes/{id}/   → update storey_merge_tolerance_m
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useProjectScopes, useScopeFloors, scopesKeys, type CanonicalFloor } from '@/hooks/use-scopes';

interface ProjectConfigRow {
  id: string;
  project: string;
  is_active: boolean;
  block_on_storey_deviation: boolean;
  storey_merge_tolerance_m?: number;
}

const projectConfigsKey = (projectId: string) => ['project-configs', projectId] as const;

function useActiveProjectConfig(projectId: string | undefined) {
  return useQuery({
    queryKey: projectConfigsKey(projectId ?? ''),
    queryFn: async () => {
      const r = await apiClient.get<{ results: ProjectConfigRow[] } | ProjectConfigRow[]>(
        `/projects/configs/?project=${projectId}`,
      );
      const data = r.data;
      const rows = Array.isArray(data) ? data : data.results;
      return rows.find((c) => c.is_active) ?? rows[0] ?? null;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function ProjectFloorsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: scopes, isLoading: scopesLoading } = useProjectScopes(projectId);
  const rootScopes = useMemo(() => scopes?.filter((s) => s.parent === null) ?? [], [scopes]);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedScopeId && rootScopes.length > 0) {
      setSelectedScopeId(rootScopes[0].id);
    }
  }, [rootScopes, selectedScopeId]);

  const { data: floors, isLoading: floorsLoading } = useScopeFloors(selectedScopeId);
  const { data: activeConfig } = useActiveProjectConfig(projectId);

  const updateConfig = useMutation({
    mutationFn: async (patch: Partial<Pick<ProjectConfigRow, 'block_on_storey_deviation'>>) => {
      if (!activeConfig) throw new Error('no active config');
      const r = await apiClient.patch<ProjectConfigRow>(
        `/projects/configs/${activeConfig.id}/`,
        patch,
      );
      return r.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectConfigsKey(projectId) });
    },
  });

  const updateScope = useMutation({
    mutationFn: async ({ scopeId, tolerance }: { scopeId: string; tolerance: number }) => {
      const r = await apiClient.patch(
        `/projects/scopes/${scopeId}/`,
        { storey_merge_tolerance_m: tolerance },
      );
      return r.data;
    },
    onSuccess: () => {
      if (selectedScopeId) {
        queryClient.invalidateQueries({ queryKey: scopesKeys.floors(selectedScopeId) });
      }
    },
  });

  const deviatingModels = useMemo(
    () => (floors?.models ?? []).filter((m) => m.issues.length > 0),
    [floors],
  );

  return (
    <div className="space-y-6 pt-2 pb-6">
      {scopesLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      )}

      {!scopesLoading && rootScopes.length === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{t('floors.noCanonical')}</p>
        </div>
      )}

      {rootScopes.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('floors.scope')}
          </span>
          <select
            className="h-8 rounded border border-border bg-background px-2 text-sm"
            value={selectedScopeId ?? ''}
            onChange={(e) => setSelectedScopeId(e.target.value || null)}
          >
            {rootScopes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {selectedScopeId && (
        <CanonicalFloorsTable
          floors={floors?.canonical_floors ?? []}
          loading={floorsLoading}
        />
      )}

      {selectedScopeId && (
        <DeviatingModelsList
          models={deviatingModels}
          loading={floorsLoading}
        />
      )}

      {selectedScopeId && floors && (
        <VerificationGatesEditor
          tolerance={floors.storey_merge_tolerance_m}
          blockOnDeviation={activeConfig?.block_on_storey_deviation ?? false}
          configMissing={!activeConfig}
          onChangeTolerance={(v) => updateScope.mutate({ scopeId: selectedScopeId, tolerance: v })}
          onToggleBlock={(v) => updateConfig.mutate({ block_on_storey_deviation: v })}
          saving={updateConfig.isPending || updateScope.isPending}
          error={
            updateConfig.error || updateScope.error
              ? t('floors.settings.saveError')
              : null
          }
        />
      )}
    </div>
  );
}

function CanonicalFloorsTable({
  floors,
  loading,
}: {
  floors: CanonicalFloor[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (floors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
        {t('floors.noCanonical')}
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {t('floors.canonical')} ({floors.length})
      </h2>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_140px_1fr] bg-muted/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{t('floors.code')}</span>
          <span>{t('floors.name')}</span>
          <span className="text-right">{t('floors.elevation')}</span>
          <span>{t('floors.aliases')}</span>
        </div>
        {floors.map((f) => (
          <div
            key={f.code}
            className="grid grid-cols-[80px_1fr_140px_1fr] items-center px-3 py-2 border-t text-sm"
          >
            <span className="font-mono text-xs text-muted-foreground">{f.code}</span>
            <span className="font-medium">{f.name}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              {f.elevation_m === null || f.elevation_m === undefined
                ? '—'
                : `${f.elevation_m.toFixed(2)} m`}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {(f.aliases ?? []).join(', ') || '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeviatingModelsList({
  models,
  loading,
}: {
  models: NonNullable<ReturnType<typeof useScopeFloors>['data']>['models'];
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (loading) return null;

  if (models.length === 0) {
    return (
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {t('floors.models')}
        </h2>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t('floors.noDeviations')}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {t('floors.models')} ({models.length})
      </h2>
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.model_id} className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
              <span className="font-medium text-sm">{m.model_name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {m.issues.length} issue{m.issues.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="divide-y">
              {m.issues.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <AlertTriangle
                    className={cn(
                      'h-3.5 w-3.5 mt-0.5 shrink-0',
                      i.severity === 'error' ? 'text-rose-600' : 'text-amber-600',
                    )}
                  />
                  <span className="text-foreground">{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function VerificationGatesEditor({
  tolerance,
  blockOnDeviation,
  configMissing,
  onChangeTolerance,
  onToggleBlock,
  saving,
  error,
}: {
  tolerance: number;
  blockOnDeviation: boolean;
  configMissing: boolean;
  onChangeTolerance: (v: number) => void;
  onToggleBlock: (v: boolean) => void;
  saving: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [toleranceDraft, setToleranceDraft] = useState(tolerance.toString());

  useEffect(() => {
    setToleranceDraft(tolerance.toString());
  }, [tolerance]);

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {t('floors.settings.title')}
      </h2>
      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('floors.settings.blockOnDeviation')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('floors.settings.blockOnDeviationHint')}
            </div>
            {configMissing && (
              <div className="text-xs text-amber-700 mt-1">
                No active project config found.
              </div>
            )}
          </div>
          <input
            type="checkbox"
            checked={blockOnDeviation}
            disabled={configMissing || saving}
            onChange={(e) => onToggleBlock(e.target.checked)}
            className="h-4 w-4 mt-1"
          />
        </label>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t('floors.settings.mergeTolerance')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('floors.settings.mergeToleranceHint')}
            </div>
          </div>
          <input
            type="number"
            min={0}
            step={0.05}
            value={toleranceDraft}
            disabled={saving}
            onChange={(e) => setToleranceDraft(e.target.value)}
            onBlur={() => {
              const v = Number(toleranceDraft);
              if (Number.isFinite(v) && v !== tolerance) onChangeTolerance(v);
              else setToleranceDraft(tolerance.toString());
            }}
            className="w-24 h-8 rounded border border-border bg-background px-2 text-sm text-right tabular-nums"
          />
        </div>

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1.5">{error}</div>
        )}
      </div>
    </section>
  );
}
