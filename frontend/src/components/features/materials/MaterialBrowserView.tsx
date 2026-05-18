import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Package, Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageShell } from '@/components/Layout';
import {
  useProjectMaterials,
  type AggregatedMaterial,
} from '@/hooks/use-project-materials';
import type { FamilyKey } from '@/lib/material-families';

import { MaterialsKpiHeader } from './MaterialsKpiHeader';
import { MaterialsFamilyTreemap } from './MaterialsFamilyTreemap';
import { MaterialsTopN } from './MaterialsTopN';
import { MaterialsTable } from './MaterialsTable';
import { MaterialDetailTabs } from './MaterialDetailTabs';

interface MaterialBrowserViewProps {
  projectId: string;
}

/**
 * Smart materials dash (Session 4.5 rebuild).
 *
 * Top-to-bottom composition:
 *   1. PageShell chrome
 *   2. KPI row — 6 tiles (materials, quantity, product, EPD, cost, GWP)
 *   3. Filter bar (search + family chip + clear)
 *   4. Two-column hero: squarish family treemap (aspect-[4/3]) + TopN
 *      ranking panel
 *   5. Two-column body: materials table (breathes) + detail rail
 *
 * No Materials/Sets toggle — Sets is a TypeDefinition concept and
 * surfaces only inside a material's detail via the sandwich-stack viz.
 */
export function MaterialBrowserView({ projectId }: MaterialBrowserViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error, dataUpdatedAt } = useProjectMaterials(projectId);

  const [selectedFamily, setSelectedFamily] = useState<FamilyKey | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);

  // Source-of-filter rule: the family treemap PRODUCES the family
  // dimension, so it must stay whole on family but narrow on other
  // dimensions (search). Build a slice that applies every filter
  // EXCEPT family — the treemap reads from this, everything else
  // (table, TopN, detail) reads from the fully filtered set.
  const searchFilteredMaterials = useMemo<AggregatedMaterial[]>(() => {
    if (!data) return [];
    if (!searchQuery) return data.materials;
    const query = searchQuery.toLowerCase();
    return data.materials.filter((m) => {
      return (
        m.name.toLowerCase().includes(query) ||
        m.raw_names.some((n) => n.toLowerCase().includes(query))
      );
    });
  }, [data, searchQuery]);

  const filteredMaterials = useMemo<AggregatedMaterial[]>(() => {
    if (!selectedFamily) return searchFilteredMaterials;
    return searchFilteredMaterials.filter((m) => m.family === selectedFamily);
  }, [searchFilteredMaterials, selectedFamily]);

  // Detail panel desyncs (issue #17 finding 5): if the selected material
  // falls outside the current filter, drop the selection so the right
  // pane reflects what's visible. The user can pick a new one.
  useEffect(() => {
    if (!selectedMaterialKey) return;
    if (!filteredMaterials.some((m) => m.key === selectedMaterialKey)) {
      setSelectedMaterialKey(null);
    }
  }, [filteredMaterials, selectedMaterialKey]);

  const selectedMaterial = useMemo(
    () => filteredMaterials.find((m) => m.key === selectedMaterialKey) ?? null,
    [filteredMaterials, selectedMaterialKey],
  );

  const clearFilters = () => {
    setSelectedFamily(null);
    setSearchQuery('');
  };

  if (isLoading && !data?.materials.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-secondary text-[clamp(0.7rem,1vw,0.85rem)]">
          {t('materialBrowser.loading')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-error">
          <AlertCircle className="h-[clamp(1.5rem,3vw,2rem)] w-[clamp(1.5rem,3vw,2rem)]" />
          <div className="text-[clamp(0.75rem,1vw,0.9rem)]">
            {t('materialBrowser.loadError')}
          </div>
          <div className="text-[clamp(0.6rem,0.8vw,0.75rem)] text-text-tertiary">
            {error.message}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.materials.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
        <Package className="h-[clamp(2rem,5vw,3.5rem)] w-[clamp(2rem,5vw,3.5rem)] opacity-40" />
        <h2 className="text-[clamp(0.95rem,1.6vw,1.25rem)] font-semibold">
          {t('materialBrowser.emptyTitle')}
        </h2>
        <p className="max-w-md text-center text-[clamp(0.7rem,1vw,0.85rem)]">
          {t('materialBrowser.emptyDescription')}
        </p>
      </div>
    );
  }

  const hasActiveFilter = !!selectedFamily || !!searchQuery;

  return (
    <PageShell title={t('materials.title')} subtitle={t('materials.description')}>
      {/* KPI grid + freshness */}
      <MaterialsKpiHeader
        summary={data.summary}
        materials={data.materials}
        filteredCount={filteredMaterials.length}
        loading={isLoading}
        dataUpdatedAt={dataUpdatedAt}
      />

      {/* Filter bar — search + clear (no Materials/Sets toggle) */}
      <div className="flex flex-wrap items-center gap-[clamp(0.375rem,0.8vw,0.75rem)] rounded-md border bg-muted/10 px-[clamp(0.625rem,1.2vw,1rem)] py-[clamp(0.375rem,0.7vh,0.625rem)]">
        <div className="relative flex-1 min-w-[clamp(11rem,18vw,16rem)]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('materialBrowser.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[clamp(1.75rem,2.5vh,2.25rem)] pl-9 text-[clamp(0.65rem,0.9vw,0.8rem)]"
          />
        </div>
        {selectedFamily && (
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-[clamp(0.5rem,1vw,0.75rem)] py-0.5 text-[clamp(0.55rem,0.8vw,0.7rem)]">
            <span className="text-text-secondary">
              {t(`materialBrowser.family.${selectedFamily}`)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedFamily(null)}
              className="text-text-tertiary hover:text-text-primary"
              aria-label={t('materialBrowser.clearFilter')}
            >
              ×
            </button>
          </div>
        )}
        {hasActiveFilter && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            className="h-7 text-[clamp(0.6rem,0.9vw,0.75rem)]"
          >
            {t('materialBrowser.clearFilter')}
          </Button>
        )}
        <div className="ml-auto text-[clamp(0.55rem,0.8vw,0.7rem)] text-text-tertiary tabular-nums">
          {t('materialBrowser.shown', {
            shown: filteredMaterials.length,
            total: data.materials.length,
          })}
        </div>
      </div>

      {data.summary.loading && (
        <div className="text-[clamp(0.6rem,0.85vw,0.75rem)] text-text-tertiary">
          {t('materialBrowser.header.loadingRemaining', {
            loaded: data.summary.models_loaded,
            pending: data.summary.models_pending,
          })}
        </div>
      )}

      {/* Hero row — squarish treemap + TopN ranking panel */}
      <div className="grid gap-[clamp(0.5rem,1vw,0.875rem)] grid-cols-1 lg:grid-cols-[1fr_clamp(280px,28vw,420px)]">
        <div className="flex justify-start">
          <div className="w-full max-w-[clamp(360px,40vw,640px)] aspect-[4/3]">
            <MaterialsFamilyTreemap
              materials={searchFilteredMaterials}
              activeFamily={selectedFamily}
              onFamilyClick={(family) => {
                setSelectedFamily(family === selectedFamily ? null : family);
              }}
              className="h-full"
            />
          </div>
        </div>
        <MaterialsTopN
          materials={filteredMaterials}
          selectedKey={selectedMaterialKey}
          onSelect={setSelectedMaterialKey}
          className="h-full min-h-[clamp(240px,32vh,420px)]"
        />
      </div>

      {/* Two-column body: table (left, breathes) + detail (right) */}
      <div className="grid gap-[clamp(0.5rem,1vw,0.875rem)] grid-cols-1 lg:grid-cols-[1fr_clamp(320px,28vw,460px)]">
        <div className="flex flex-col max-h-[clamp(360px,55vh,640px)] rounded-md border bg-background overflow-hidden">
          {filteredMaterials.length === 0 ? (
            <EmptyResults onClearFilters={clearFilters} />
          ) : (
            <MaterialsTable
              materials={filteredMaterials}
              selectedKey={selectedMaterialKey}
              onSelect={setSelectedMaterialKey}
            />
          )}
        </div>

        <div className="flex flex-col max-h-[clamp(360px,55vh,640px)] rounded-md border bg-muted/10 overflow-hidden">
          <ScrollArea className="h-full">
            {selectedMaterial ? (
              <MaterialDetailTabs
                material={selectedMaterial}
                onNavigateToType={(typeId, modelId) => {
                  navigate(
                    `/projects/${projectId}/types?view=list&model=${modelId}&type=${typeId}`,
                  );
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-[clamp(0.75rem,1.5vw,1.25rem)] text-center text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
                <Sparkles className="h-[clamp(1.25rem,2vw,1.75rem)] w-[clamp(1.25rem,2vw,1.75rem)] opacity-40" />
                <div>{t('materialBrowser.detail.selectPrompt')}</div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </PageShell>
  );
}

function EmptyResults({ onClearFilters }: { onClearFilters: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[clamp(0.5rem,1vh,0.875rem)] p-[clamp(0.75rem,1.5vw,1.25rem)] text-center">
      <Package className="h-[clamp(1.25rem,2vw,1.75rem)] w-[clamp(1.25rem,2vw,1.75rem)] text-text-tertiary opacity-50" />
      <div className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
        {t('materialBrowser.noResults')}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onClearFilters}
        className="h-7 text-[clamp(0.6rem,0.9vw,0.75rem)]"
      >
        {t('materialBrowser.clearFilter')}
      </Button>
    </div>
  );
}

export default MaterialBrowserView;
