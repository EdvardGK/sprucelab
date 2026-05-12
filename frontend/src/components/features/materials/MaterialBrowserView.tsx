import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Layers,
  Leaf,
  LayoutGrid,
  ListTree,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageShell } from '@/components/Layout';
import { cn } from '@/lib/utils';
import {
  useProjectMaterials,
  type AggregatedMaterial,
} from '@/hooks/use-project-materials';
import type { FamilyKey } from '@/lib/material-families';

import { MaterialsKpiHeader } from './MaterialsKpiHeader';
import { MaterialsFamilyTree } from './MaterialsFamilyTree';
import { MaterialsFamilyTreemap } from './MaterialsFamilyTreemap';
import { MaterialsTable, type LensMode } from './MaterialsTable';
import { MaterialSetCard } from './MaterialSetCard';
import { MaterialDetailTabs } from './MaterialDetailTabs';
import { MaterialSetDetail } from './MaterialSetDetail';

type TabMode = 'materials' | 'sets';
type FamilyView = 'tree' | 'treemap';

interface MaterialBrowserViewProps {
  projectId: string;
}

export function MaterialBrowserView({ projectId }: MaterialBrowserViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error, dataUpdatedAt } = useProjectMaterials(projectId);

  const [selectedFamily, setSelectedFamily] = useState<FamilyKey | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [familyView, setFamilyView] = useState<FamilyView>('tree');
  const [tab, setTab] = useState<TabMode>('materials');
  const [lens, setLens] = useState<LensMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);
  const [selectedSetSignature, setSelectedSetSignature] = useState<string | null>(null);

  const filteredMaterials = useMemo<AggregatedMaterial[]>(() => {
    if (!data) return [];
    return data.materials.filter((m) => {
      if (selectedFamily && m.family !== selectedFamily) return false;
      if (selectedSubtype && m.subtype !== selectedSubtype) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !m.name.toLowerCase().includes(query) &&
          !m.raw_names.some((n) => n.toLowerCase().includes(query))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data, selectedFamily, selectedSubtype, searchQuery]);

  const filteredSets = useMemo(() => {
    if (!data) return [];
    return data.sets.filter((s) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !s.name.toLowerCase().includes(query) &&
          !s.layers.some((l) => l.material_name.toLowerCase().includes(query))
        ) {
          return false;
        }
      }
      if (selectedFamily) {
        if (!s.layers.some((l) => l.family === selectedFamily)) return false;
      }
      return true;
    });
  }, [data, selectedFamily, searchQuery]);

  const selectedMaterial = useMemo(
    () => data?.materials.find((m) => m.key === selectedMaterialKey) ?? null,
    [data, selectedMaterialKey],
  );

  const selectedSet = useMemo(
    () => data?.sets.find((s) => s.signature === selectedSetSignature) ?? null,
    [data, selectedSetSignature],
  );

  const clearFilters = () => {
    setSelectedFamily(null);
    setSelectedSubtype(null);
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

  const hasActiveFilter = !!selectedFamily || !!selectedSubtype || !!searchQuery;

  return (
    <PageShell title={t('materials.title')} subtitle={t('materials.description')}>
      {/* KPI grid + freshness */}
      <MaterialsKpiHeader
        summary={data.summary}
        materials={data.materials}
        loading={isLoading}
        dataUpdatedAt={dataUpdatedAt}
      />

      {/* Filter / lens / tab bar */}
      <div className="flex flex-wrap items-center gap-[clamp(0.375rem,0.8vw,0.75rem)] rounded-md border bg-muted/10 px-[clamp(0.625rem,1.2vw,1rem)] py-[clamp(0.375rem,0.7vh,0.625rem)]">
        <div className="relative min-w-[clamp(11rem,18vw,16rem)] flex-1 max-w-[clamp(14rem,22vw,20rem)]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('materialBrowser.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[clamp(1.75rem,2.5vh,2.25rem)] pl-9 text-[clamp(0.65rem,0.9vw,0.8rem)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
          <button
            onClick={() => setTab('materials')}
            className={cn(
              'rounded px-[clamp(0.625rem,1.2vw,1rem)] py-1 text-[clamp(0.6rem,0.9vw,0.75rem)] font-medium transition-colors',
              tab === 'materials'
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t('materialBrowser.tab.materials', { count: filteredMaterials.length })}
          </button>
          <button
            onClick={() => setTab('sets')}
            className={cn(
              'rounded px-[clamp(0.625rem,1.2vw,1rem)] py-1 text-[clamp(0.6rem,0.9vw,0.75rem)] font-medium transition-colors',
              tab === 'sets'
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t('materialBrowser.tab.sets', { count: filteredSets.length })}
          </button>
        </div>
        <LensSwitch value={lens} onChange={setLens} />
        <FamilyViewSwitch value={familyView} onChange={setFamilyView} />
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
      </div>

      {data.summary.loading && (
        <div className="text-[clamp(0.6rem,0.85vw,0.75rem)] text-text-tertiary">
          {t('materialBrowser.header.loadingRemaining', {
            loaded: data.summary.models_loaded,
            pending: data.summary.models_pending,
          })}
        </div>
      )}

      {/* Family visualization — tree OR treemap */}
      {familyView === 'treemap' && (
        <div className="h-[clamp(220px,28vh,360px)]">
          <MaterialsFamilyTreemap
            materials={data.materials}
            activeFamily={selectedFamily}
            onFamilyClick={(family) => {
              setSelectedFamily(family === selectedFamily ? null : family);
              setSelectedSubtype(null);
            }}
            className="h-full"
          />
        </div>
      )}

      {/* Main 3-column layout: tree (or empty) + table + detail */}
      <div
        className={cn(
          'grid flex-1 min-h-[clamp(360px,55vh,640px)] gap-[clamp(0.5rem,1vw,0.875rem)]',
          familyView === 'tree'
            ? 'grid-cols-[clamp(220px,18vw,300px)_1fr_clamp(280px,24vw,380px)]'
            : 'grid-cols-[1fr_clamp(300px,26vw,420px)]',
        )}
      >
        {familyView === 'tree' && (
          <div className="flex flex-col min-h-0 rounded-md border bg-background overflow-hidden">
            <div className="px-[clamp(0.5rem,1vw,0.75rem)] py-[clamp(0.375rem,0.6vh,0.5rem)] border-b text-[clamp(0.55rem,0.8vw,0.7rem)] uppercase tracking-wide text-text-tertiary">
              {t('materialBrowser.viz.familiesHeading')}
            </div>
            <MaterialsFamilyTree
              families={data.families}
              selectedFamily={selectedFamily}
              selectedSubtype={selectedSubtype}
              onSelectFamily={setSelectedFamily}
              onSelectSubtype={setSelectedSubtype}
            />
          </div>
        )}

        {/* Center: table or set cards */}
        <div className="flex flex-col min-h-0 rounded-md border bg-background overflow-hidden">
          {tab === 'materials' ? (
            filteredMaterials.length === 0 ? (
              <EmptyResults onClearFilters={clearFilters} />
            ) : (
              <MaterialsTable
                materials={filteredMaterials}
                lens={lens}
                selectedKey={selectedMaterialKey}
                onSelect={setSelectedMaterialKey}
              />
            )
          ) : filteredSets.length === 0 ? (
            <EmptyResults onClearFilters={clearFilters} />
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-[clamp(0.375rem,0.8vw,0.625rem)]">
                {filteredSets.map((s) => (
                  <MaterialSetCard
                    key={s.signature}
                    set={s}
                    selected={s.signature === selectedSetSignature}
                    onClick={() =>
                      setSelectedSetSignature(
                        s.signature === selectedSetSignature ? null : s.signature,
                      )
                    }
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right: detail panel */}
        <div className="flex flex-col min-h-0 rounded-md border bg-muted/10 overflow-hidden">
          <ScrollArea className="flex-1">
            {tab === 'materials' && selectedMaterial ? (
              <MaterialDetailTabs
                material={selectedMaterial}
                onNavigateToType={(typeId, modelId) => {
                  navigate(
                    `/projects/${projectId}/types?view=list&model=${modelId}&type=${typeId}`,
                  );
                }}
              />
            ) : tab === 'sets' && selectedSet ? (
              <MaterialSetDetail set={selectedSet} />
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

function LensSwitch({
  value,
  onChange,
}: {
  value: LensMode;
  onChange: (v: LensMode) => void;
}) {
  const { t } = useTranslation();
  const options: { key: LensMode; labelKey: string; icon: typeof Leaf }[] = [
    { key: 'all', labelKey: 'materialBrowser.lens.all', icon: Layers },
    { key: 'lca', labelKey: 'materialBrowser.lens.lca', icon: Leaf },
    {
      key: 'procurement',
      labelKey: 'materialBrowser.lens.procurement',
      icon: ShoppingCart,
    },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              'flex items-center gap-1 rounded px-[clamp(0.5rem,1vw,0.75rem)] py-1 text-[clamp(0.6rem,0.9vw,0.75rem)] font-medium transition-colors',
              value === o.key
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon className="h-3 w-3" />
            {t(o.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function FamilyViewSwitch({
  value,
  onChange,
}: {
  value: FamilyView;
  onChange: (v: FamilyView) => void;
}) {
  const { t } = useTranslation();
  const options: { key: FamilyView; labelKey: string; icon: typeof Leaf }[] = [
    {
      key: 'tree',
      labelKey: 'materialBrowser.viz.familyView.tree',
      icon: ListTree,
    },
    {
      key: 'treemap',
      labelKey: 'materialBrowser.viz.familyView.treemap',
      icon: LayoutGrid,
    },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              'flex items-center gap-1 rounded px-[clamp(0.5rem,1vw,0.75rem)] py-1 text-[clamp(0.6rem,0.9vw,0.75rem)] font-medium transition-colors',
              value === o.key
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
            title={t(o.labelKey)}
            aria-label={t(o.labelKey)}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden md:inline">{t(o.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default MaterialBrowserView;
