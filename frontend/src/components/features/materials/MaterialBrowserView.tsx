import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Package,
  Leaf,
  ShoppingCart,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useProjectMaterials,
  type AggregatedMaterial,
  type MaterialSet,
  type MaterialUnit,
} from '@/hooks/use-project-materials';
import { FAMILIES, type FamilyKey } from '@/lib/material-families';

type LensMode = 'all' | 'lca' | 'procurement';
type TabMode = 'materials' | 'sets';

interface MaterialBrowserViewProps {
  projectId: string;
}

export function MaterialBrowserView({ projectId }: MaterialBrowserViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error } = useProjectMaterials(projectId);

  const [selectedFamily, setSelectedFamily] = useState<FamilyKey | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<FamilyKey>>(
    new Set(FAMILIES.map((f) => f.key)),
  );
  const [tab, setTab] = useState<TabMode>('materials');
  const [lens, setLens] = useState<LensMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);
  const [selectedSetSignature, setSelectedSetSignature] = useState<string | null>(null);

  const filteredMaterials = useMemo(() => {
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

  const toggleFamilyExpand = (key: FamilyKey) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading && !data?.materials.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-secondary">{t('materialBrowser.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-error">
          <AlertCircle className="h-8 w-8" />
          <div>{t('materialBrowser.loadError')}</div>
          <div className="text-xs text-text-tertiary">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!data || data.materials.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
        <Package className="h-12 w-12 opacity-40" />
        <h2 className="text-lg font-semibold">{t('materialBrowser.emptyTitle')}</h2>
        <p className="max-w-md text-center text-sm">
          {t('materialBrowser.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header bar — coverage stats + lens toggle */}
      <div className="flex-none border-b bg-muted/30 px-[clamp(0.75rem,2vw,1.25rem)] py-[clamp(0.5rem,1.5vw,0.875rem)]">
        <div className="flex items-center gap-[clamp(0.75rem,2vw,1.5rem)] flex-wrap">
          <div className="flex items-center gap-[clamp(0.5rem,1.5vw,1rem)]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[clamp(1rem,2vw,1.25rem)] font-semibold text-text-primary">
                {data.summary.total_materials}
              </span>
              <span className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-secondary">
                {t('materialBrowser.header.materials')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[clamp(1rem,2vw,1.25rem)] font-semibold text-text-primary">
                {data.summary.total_sets}
              </span>
              <span className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-secondary">
                {t('materialBrowser.header.sets')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[clamp(1rem,2vw,1.25rem)] font-semibold text-text-primary">
                {data.summary.classified_percent}%
              </span>
              <span className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-secondary">
                {t('materialBrowser.header.classified')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[clamp(1rem,2vw,1.25rem)] font-semibold text-error">
                {data.summary.epd_linked_percent}%
              </span>
              <span className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-secondary">
                {t('materialBrowser.header.epdLinked')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-[clamp(1rem,2vw,1.25rem)] font-semibold text-error">
                {data.summary.procurement_linked_percent}%
              </span>
              <span className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-secondary">
                {t('materialBrowser.header.procurementLinked')}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LensSwitch value={lens} onChange={setLens} />
          </div>
        </div>

        {data.summary.loading && (
          <div className="mt-1.5 text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
            {t('materialBrowser.header.loadingRemaining', {
              loaded: data.summary.models_loaded,
              pending: data.summary.models_pending,
            })}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex-none flex items-center gap-2 border-b bg-muted/10 px-[clamp(0.75rem,2vw,1.25rem)] py-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('materialBrowser.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
          <button
            onClick={() => setTab('materials')}
            className={cn(
              'rounded px-3 py-1 text-[clamp(0.625rem,1vw,0.75rem)] font-medium transition-colors',
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
              'rounded px-3 py-1 text-[clamp(0.625rem,1vw,0.75rem)] font-medium transition-colors',
              tab === 'sets'
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t('materialBrowser.tab.sets', { count: filteredSets.length })}
          </button>
        </div>
        {(selectedFamily || selectedSubtype) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedFamily(null);
              setSelectedSubtype(null);
            }}
            className="h-7 text-[clamp(0.625rem,1vw,0.75rem)]"
          >
            {t('materialBrowser.clearFilter')}
          </Button>
        )}
      </div>

      {/* Main 3-column layout */}
      <div className="grid flex-1 min-h-0 grid-cols-[clamp(240px,18vw,280px)_1fr_clamp(280px,22vw,360px)] overflow-hidden">
        {/* Left: Family tree */}
        <div className="flex flex-col min-h-0 border-r overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {data.families.map((family) => (
                <FamilyTreeNode
                  key={family.key}
                  family={family}
                  expanded={expandedFamilies.has(family.key)}
                  selectedFamily={selectedFamily}
                  selectedSubtype={selectedSubtype}
                  onToggleExpand={() => toggleFamilyExpand(family.key)}
                  onSelectFamily={() => {
                    setSelectedFamily(family.key === selectedFamily ? null : family.key);
                    setSelectedSubtype(null);
                  }}
                  onSelectSubtype={(subtypeKey) => {
                    setSelectedFamily(family.key);
                    setSelectedSubtype(subtypeKey === selectedSubtype ? null : subtypeKey);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Center: Table */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1">
            {tab === 'materials' ? (
              filteredMaterials.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
                  {t('materialBrowser.noResults')}
                </div>
              ) : (
                <table className="w-full text-[clamp(0.625rem,1vw,0.75rem)]">
                  <thead className="sticky top-0 z-10 bg-background shadow-sm">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium text-text-secondary">
                        {t('materialBrowser.column.name')}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-text-secondary">
                        {t('materialBrowser.column.family')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-text-secondary">
                        {t('materialBrowser.column.quantity')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-text-secondary">
                        {t('materialBrowser.column.usedIn')}
                      </th>
                      {(lens === 'all' || lens === 'lca') && (
                        <th className="px-3 py-2 text-center font-medium text-text-secondary">
                          {t('materialBrowser.column.lca')}
                        </th>
                      )}
                      {(lens === 'all' || lens === 'procurement') && (
                        <th className="px-3 py-2 text-center font-medium text-text-secondary">
                          {t('materialBrowser.column.procurement')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((m) => (
                      <MaterialRow
                        key={m.key}
                        material={m}
                        lens={lens}
                        selected={m.key === selectedMaterialKey}
                        onClick={() => setSelectedMaterialKey(m.key === selectedMaterialKey ? null : m.key)}
                      />
                    ))}
                  </tbody>
                </table>
              )
            ) : filteredSets.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
                {t('materialBrowser.noResults')}
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {filteredSets.map((s) => (
                  <SetCard
                    key={s.signature}
                    set={s}
                    selected={s.signature === selectedSetSignature}
                    onClick={() =>
                      setSelectedSetSignature(s.signature === selectedSetSignature ? null : s.signature)
                    }
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Detail panel */}
        <div className="flex flex-col min-h-0 border-l overflow-hidden bg-muted/10">
          <ScrollArea className="flex-1">
            {tab === 'materials' && selectedMaterial ? (
              <MaterialDetailPanel material={selectedMaterial} onNavigateToType={(typeId, modelId) => {
                navigate(`/projects/${projectId}/types?view=list&model=${modelId}&type=${typeId}`);
              }} />
            ) : tab === 'sets' && selectedSet ? (
              <SetDetailPanel set={selectedSet} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
                <Sparkles className="h-6 w-6 opacity-40" />
                <div>{t('materialBrowser.detail.selectPrompt')}</div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FAMILY TREE
// ============================================================================

interface FamilyTreeNodeProps {
  family: {
    key: FamilyKey;
    labelKey: string;
    material_count: number;
    instance_count: number;
    subtypes: { key: string; labelKey: string; material_count: number; instance_count: number }[];
  };
  expanded: boolean;
  selectedFamily: FamilyKey | null;
  selectedSubtype: string | null;
  onToggleExpand: () => void;
  onSelectFamily: () => void;
  onSelectSubtype: (key: string) => void;
}

function FamilyTreeNode({
  family,
  expanded,
  selectedFamily,
  selectedSubtype,
  onToggleExpand,
  onSelectFamily,
  onSelectSubtype,
}: FamilyTreeNodeProps) {
  const { t } = useTranslation();
  const isSelected = selectedFamily === family.key;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted/50 text-text-primary',
        )}
        onClick={onSelectFamily}
      >
        {family.subtypes.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex h-4 w-4 items-center justify-center text-text-tertiary"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <div className="w-4" />
        )}
        <span className="flex-1 truncate text-[clamp(0.625rem,1vw,0.8125rem)] font-medium">
          {t(family.labelKey)}
        </span>
        <Badge variant="secondary" className="h-4 px-1 text-[clamp(0.5rem,0.8vw,0.625rem)]">
          {family.material_count}
        </Badge>
      </div>
      {expanded && family.subtypes.length > 0 && (
        <div className="ml-4 space-y-0.5 border-l border-border/50 pl-2">
          {family.subtypes.map((s) => {
            const isSubtypeSelected = selectedFamily === family.key && selectedSubtype === s.key;
            return (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 cursor-pointer transition-colors',
                  isSubtypeSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50 text-text-secondary',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSubtype(s.key);
                }}
              >
                <span className="flex-1 truncate text-[clamp(0.5rem,0.9vw,0.6875rem)]">{t(s.labelKey)}</span>
                <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary">
                  {s.material_count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LENS SWITCH
// ============================================================================

function LensSwitch({ value, onChange }: { value: LensMode; onChange: (v: LensMode) => void }) {
  const { t } = useTranslation();
  const options: { key: LensMode; labelKey: string; icon: typeof Leaf }[] = [
    { key: 'all', labelKey: 'materialBrowser.lens.all', icon: Layers },
    { key: 'lca', labelKey: 'materialBrowser.lens.lca', icon: Leaf },
    { key: 'procurement', labelKey: 'materialBrowser.lens.procurement', icon: ShoppingCart },
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
              'flex items-center gap-1 rounded px-2 py-1 text-[clamp(0.625rem,1vw,0.75rem)] font-medium transition-colors',
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

// ============================================================================
// MATERIAL ROW
// ============================================================================

function MaterialRow({
  material,
  lens,
  selected,
  onClick,
}: {
  material: AggregatedMaterial;
  lens: LensMode;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const primaryQty = dominantQuantity(material.quantities_by_unit);
  const typeCount = new Set(material.used_in_types.map((u) => u.type_id)).size;
  const totalInstances = material.used_in_types.reduce((sum, u) => sum + u.instance_count, 0);

  return (
    <tr
      onClick={onClick}
      className={cn(
        'cursor-pointer border-b transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-muted/30',
      )}
    >
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <div className="font-medium text-text-primary">{material.name}</div>
          {material.raw_names.length > 1 && (
            <div className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary">
              +{material.raw_names.length - 1} {t('materialBrowser.aliases')}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-text-primary">{t(`materialBrowser.family.${material.family}`)}</span>
          {material.family_confidence === 'suggested' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-warning">
              {t('materialBrowser.suggested')}
            </span>
          )}
          {material.family_confidence === 'unknown' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-error">
              {t('materialBrowser.unclassified')}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {primaryQty ? `${formatQty(primaryQty.value)} ${primaryQty.unit}` : '—'}
      </td>
      <td className="px-3 py-2 text-right text-text-secondary">
        {typeCount}
        <span className="ml-1 text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary">
          ({totalInstances})
        </span>
      </td>
      {(lens === 'all' || lens === 'lca') && (
        <td className="px-3 py-2 text-center">
          <ReadinessLight ready={material.has_epd} />
        </td>
      )}
      {(lens === 'all' || lens === 'procurement') && (
        <td className="px-3 py-2 text-center">
          <ReadinessLight ready={material.has_product} />
        </td>
      )}
    </tr>
  );
}

function ReadinessLight({ ready }: { ready: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto h-2 w-2 rounded-full',
        ready ? 'bg-success' : 'bg-error',
      )}
    />
  );
}

// ============================================================================
// SET CARD
// ============================================================================

function SetCard({
  set,
  selected,
  onClick,
}: {
  set: MaterialSet;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const typeCount = new Set(set.used_in_types.map((u) => u.type_id)).size;

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-md border p-3 transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium text-[clamp(0.625rem,1vw,0.8125rem)] text-text-primary">
            {set.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
            <span>{set.layer_count} {t('materialBrowser.set.layers')}</span>
            {set.total_thickness_mm !== null && (
              <>
                <span>·</span>
                <span>{set.total_thickness_mm.toFixed(0)} mm</span>
              </>
            )}
            <span>·</span>
            <span>{typeCount} {t('materialBrowser.set.types')}</span>
          </div>
        </div>
        <Badge variant="secondary" className="text-[clamp(0.5rem,0.8vw,0.625rem)]">
          {set.total_instance_count}
        </Badge>
      </div>
      {/* Layer preview */}
      <div className="mt-2 flex gap-0.5">
        {set.layers.slice(0, 8).map((l) => (
          <div
            key={l.layer_order}
            className="h-2 flex-1 rounded-sm"
            style={{ backgroundColor: familyColor(l.family) }}
            title={l.material_name}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// DETAIL PANELS
// ============================================================================

function MaterialDetailPanel({
  material,
  onNavigateToType,
}: {
  material: AggregatedMaterial;
  onNavigateToType: (typeId: string, modelId: string) => void;
}) {
  const { t } = useTranslation();
  const totalInstances = material.used_in_types.reduce((sum, u) => sum + u.instance_count, 0);
  const uniqueTypes = Array.from(
    new Map(material.used_in_types.map((u) => [u.type_id, u])).values(),
  );

  return (
    <div className="space-y-4 p-[clamp(0.75rem,1.5vw,1rem)]">
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.material')}
        </div>
        <div className="mt-0.5 text-[clamp(0.875rem,1.6vw,1.0625rem)] font-semibold text-text-primary">
          {material.name}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[clamp(0.5rem,0.9vw,0.6875rem)]">
            {t(`materialBrowser.family.${material.family}`)}
          </Badge>
          {material.subtype && (
            <Badge variant="outline" className="text-[clamp(0.5rem,0.9vw,0.6875rem)]">
              {material.subtype}
            </Badge>
          )}
        </div>
      </div>

      {material.raw_names.length > 1 && (
        <div>
          <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
            {t('materialBrowser.detail.aliases')}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {material.raw_names.map((n) => (
              <Badge key={n} variant="outline" className="text-[clamp(0.5rem,0.9vw,0.6875rem)] font-normal">
                {n}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.quantities')}
        </div>
        <div className="mt-1 space-y-0.5">
          {(Object.keys(material.quantities_by_unit) as MaterialUnit[])
            .filter((u) => material.quantities_by_unit[u] > 0)
            .map((u) => (
              <div key={u} className="flex justify-between text-[clamp(0.625rem,1.1vw,0.8125rem)]">
                <span className="text-text-secondary">{u}</span>
                <span className="font-mono font-medium text-text-primary">
                  {formatQty(material.quantities_by_unit[u])}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* LCA readiness */}
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2">
          <Leaf className="h-3.5 w-3.5 text-text-secondary" />
          <div className="text-[clamp(0.625rem,1vw,0.75rem)] font-medium text-text-primary">
            {t('materialBrowser.detail.lcaReadiness')}
          </div>
          <ReadinessLight ready={material.has_epd} />
        </div>
        <div className="mt-1.5 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
          {material.has_epd ? t('materialBrowser.detail.lcaReady') : t('materialBrowser.detail.lcaMissing')}
        </div>
      </div>

      {/* Procurement readiness */}
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-3.5 w-3.5 text-text-secondary" />
          <div className="text-[clamp(0.625rem,1vw,0.75rem)] font-medium text-text-primary">
            {t('materialBrowser.detail.procurementReadiness')}
          </div>
          <ReadinessLight ready={material.has_product} />
        </div>
        <div className="mt-1.5 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
          {material.has_product
            ? t('materialBrowser.detail.procurementReady')
            : t('materialBrowser.detail.procurementMissing')}
        </div>
      </div>

      {/* Used in types */}
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
            {t('materialBrowser.detail.usedIn')}
          </div>
          <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
            {uniqueTypes.length} {t('materialBrowser.detail.types')} · {totalInstances} {t('materialBrowser.detail.instances')}
          </div>
        </div>
        <div className="mt-1 space-y-1">
          {uniqueTypes.slice(0, 20).map((u) => (
            <button
              key={u.type_id}
              onClick={() => onNavigateToType(u.type_id, u.model_id)}
              className="flex w-full items-center justify-between gap-2 rounded border bg-background p-2 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[clamp(0.625rem,1.1vw,0.8125rem)] font-medium text-text-primary">
                  {u.type_name ?? u.ifc_type}
                </div>
                <div className="truncate text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
                  {u.ifc_type} · {u.model_name ?? u.model_id.slice(0, 8)}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-none">
                <span className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
                  {u.instance_count}
                </span>
                <ExternalLink className="h-3 w-3 text-text-tertiary" />
              </div>
            </button>
          ))}
          {uniqueTypes.length > 20 && (
            <div className="text-center text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
              +{uniqueTypes.length - 20} {t('materialBrowser.detail.more')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SetDetailPanel({ set }: { set: MaterialSet }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 p-[clamp(0.75rem,1.5vw,1rem)]">
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.set')}
        </div>
        <div className="mt-0.5 text-[clamp(0.875rem,1.6vw,1.0625rem)] font-semibold text-text-primary">
          {set.name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
          <span>{set.layer_count} {t('materialBrowser.set.layers')}</span>
          {set.total_thickness_mm !== null && (
            <>
              <span>·</span>
              <span>{set.total_thickness_mm.toFixed(0)} mm</span>
            </>
          )}
        </div>
      </div>

      {/* Sandwich visualization */}
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.composition')}
        </div>
        <div className="mt-2 space-y-1">
          {set.layers.map((l) => {
            const widthPct = set.total_thickness_mm && l.thickness_mm
              ? (l.thickness_mm / set.total_thickness_mm) * 100
              : 100 / set.layer_count;
            return (
              <div key={l.layer_order} className="flex items-center gap-2">
                <div className="w-6 text-right text-[clamp(0.5rem,0.8vw,0.625rem)] font-mono text-text-tertiary">
                  {l.layer_order}
                </div>
                <div
                  className="relative h-5 rounded-sm"
                  style={{
                    width: `${Math.max(widthPct, 8)}%`,
                    backgroundColor: familyColor(l.family),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-primary">
                    {l.material_name}
                  </div>
                </div>
                {l.thickness_mm !== null && (
                  <div className="text-[clamp(0.5rem,0.8vw,0.625rem)] font-mono text-text-tertiary">
                    {l.thickness_mm.toFixed(0)} mm
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Used in types */}
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.usedIn')}
        </div>
        <div className="mt-1 space-y-1">
          {set.used_in_types.slice(0, 12).map((u) => (
            <div
              key={u.type_id}
              className="flex items-center justify-between rounded border bg-background p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[clamp(0.625rem,1.1vw,0.8125rem)] font-medium text-text-primary">
                  {u.type_name ?? u.ifc_type}
                </div>
                <div className="truncate text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
                  {u.ifc_type}
                </div>
              </div>
              <span className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
                {u.instance_count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// UTILS
// ============================================================================

function dominantQuantity(
  quantities: Record<MaterialUnit, number>,
): { value: number; unit: MaterialUnit } | null {
  const entries = (Object.entries(quantities) as [MaterialUnit, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return { value: entries[0][1], unit: entries[0][0] };
}

function formatQty(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

const FAMILY_COLORS: Record<FamilyKey, string> = {
  concrete: '#94a3b8',
  masonry: '#b45309',
  metal: '#64748b',
  wood: '#a16207',
  boards: '#f59e0b',
  insulation: '#fbbf24',
  glass: '#0ea5e9',
  membrane: '#6366f1',
  polymer: '#c026d3',
  finish: '#e879f9',
  composite: '#8b5cf6',
  technical: '#14b8a6',
  other: '#9ca3af',
};

function familyColor(key: FamilyKey): string {
  return FAMILY_COLORS[key] ?? '#9ca3af';
}

export default MaterialBrowserView;
