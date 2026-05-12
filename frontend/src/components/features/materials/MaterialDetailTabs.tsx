import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Leaf, ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { InlineViewer } from '@/components/features/viewer/InlineViewer';
import { familyColor } from './familyColors';
import { MaterialSpherePreview } from './MaterialSpherePreview';
import { MaterialSandwichStack } from './MaterialSandwichStack';
import { MaterialUsageDonut } from './MaterialUsageDonut';
import type {
  AggregatedMaterial,
  MaterialTypeUsage,
  MaterialUnit,
} from '@/hooks/use-project-materials';

interface MaterialDetailTabsProps {
  material: AggregatedMaterial;
  onNavigateToType: (typeId: string, modelId: string) => void;
}

/**
 * Detail rail for a single material. Three tabs:
 *
 * - Definition — PBR sphere preview + sandwich-stack OR donut + quantities
 * - Used in   — per-type usage list, navigates to Type page
 * - Readiness — LCA + procurement lights with explanations
 *
 * The Definition tab picks ONE viz based on the material's nature:
 *   - Layered (has thickness in at least one used_in_types entry)
 *       -> MaterialSandwichStack
 *   - Non-layered (bulk use, e.g. furniture or fittings)
 *       -> MaterialUsageDonut
 *
 * Sandwich + donut are mutually exclusive by design — the spec is that
 * the visualization mirrors the material's physics.
 */
export function MaterialDetailTabs({
  material,
  onNavigateToType,
}: MaterialDetailTabsProps) {
  const { t } = useTranslation();
  const totalInstances = material.used_in_types.reduce(
    (sum, u) => sum + u.instance_count,
    0,
  );
  const uniqueTypes = Array.from(
    new Map(material.used_in_types.map((u) => [u.type_id, u])).values(),
  );

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.875rem)] p-[clamp(0.75rem,1.5vw,1rem)]">
      {/* Header — always visible */}
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.material')}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            aria-hidden
            className="h-[clamp(0.5rem,0.7vw,0.7rem)] w-[clamp(0.5rem,0.7vw,0.7rem)] rounded-sm shrink-0"
            style={{ background: familyColor(material.family) }}
          />
          <div className="text-[clamp(0.875rem,1.6vw,1.0625rem)] font-semibold text-text-primary truncate">
            {material.name}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="text-[clamp(0.5rem,0.9vw,0.6875rem)]"
          >
            {t(`materialBrowser.family.${material.family}`)}
          </Badge>
          {material.subtype && (
            <Badge
              variant="outline"
              className="text-[clamp(0.5rem,0.9vw,0.6875rem)]"
            >
              {material.subtype}
            </Badge>
          )}
          {material.family_confidence === 'suggested' && (
            <Badge
              variant="outline"
              className="text-[clamp(0.5rem,0.9vw,0.6875rem)] border-amber-400/60 text-amber-600 dark:text-amber-400"
            >
              {t('materialBrowser.suggested')}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="definition" className="w-full">
        <TabsList className="grid grid-cols-3 h-auto p-0.5 bg-muted/60">
          <TabsTrigger
            value="definition"
            className="text-[clamp(0.55rem,0.85vw,0.75rem)] py-1"
          >
            {t('materialBrowser.detail.tab.definition')}
          </TabsTrigger>
          <TabsTrigger
            value="usage"
            className="text-[clamp(0.55rem,0.85vw,0.75rem)] py-1"
          >
            {t('materialBrowser.detail.tab.usage')}
          </TabsTrigger>
          <TabsTrigger
            value="readiness"
            className="text-[clamp(0.55rem,0.85vw,0.75rem)] py-1"
          >
            {t('materialBrowser.detail.tab.readiness')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="definition" className="mt-[clamp(0.5rem,1vw,0.875rem)]">
          <DefinitionTab
            material={material}
            onNavigateToType={onNavigateToType}
          />
        </TabsContent>

        <TabsContent value="usage" className="mt-[clamp(0.5rem,1vw,0.875rem)]">
          <UsageTab
            uniqueTypes={uniqueTypes}
            totalInstances={totalInstances}
            onNavigateToType={onNavigateToType}
          />
        </TabsContent>

        <TabsContent value="readiness" className="mt-[clamp(0.5rem,1vw,0.875rem)]">
          <ReadinessTab material={material} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DefinitionTab({
  material,
  onNavigateToType,
}: {
  material: AggregatedMaterial;
  onNavigateToType: (typeId: string, modelId: string) => void;
}) {
  const { t } = useTranslation();
  const units = (Object.keys(material.quantities_by_unit) as MaterialUnit[])
    .filter((u) => material.quantities_by_unit[u] > 0);

  // First associated type — drives the mini viewer. Dedupe by type_id so the
  // "1 of N" count reflects unique types, not raw usage rows.
  const uniqueUsages = useMemo<MaterialTypeUsage[]>(
    () =>
      Array.from(
        new Map(material.used_in_types.map((u) => [u.type_id, u])).values(),
      ),
    [material.used_in_types],
  );
  const firstUsage = uniqueUsages[0] ?? null;

  // Decide sandwich vs donut viz. Sandwich requires at least one usage
  // with a real thickness — otherwise the donut tells the share-of-total
  // story more honestly.
  const hasLayerData = material.used_in_types.some(
    (u) => u.thickness_mm !== null && (u.thickness_mm ?? 0) > 0,
  );

  return (
    <div className="space-y-[clamp(0.625rem,1.2vw,1rem)]">
      {/* PBR sphere — the "this is what this material looks like" cue */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
            {t('materialBrowser.detail.appearance')}
          </div>
          <div className="text-[clamp(0.45rem,0.7vw,0.6rem)] text-text-tertiary italic">
            {t('materialBrowser.detail.appearanceHint')}
          </div>
        </div>
        <MaterialSpherePreview material={material} />
      </div>

      {/* Sandwich-stack OR donut, picked by the material's nature */}
      {hasLayerData ? (
        <MaterialSandwichStack material={material} />
      ) : (
        <MaterialUsageDonut material={material} onTypeClick={onNavigateToType} />
      )}

      {/* Geometry preview from the first associated type */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
            {t('materialBrowser.detail.preview')}
          </div>
          {firstUsage && uniqueUsages.length > 1 && (
            <div className="text-[clamp(0.5rem,0.85vw,0.6875rem)] text-text-tertiary tabular-nums">
              {t('materialBrowser.detail.showingOneOf', {
                name: firstUsage.type_name ?? firstUsage.ifc_type,
                index: 1,
                total: uniqueUsages.length,
              })}
            </div>
          )}
          {firstUsage && uniqueUsages.length === 1 && (
            <div className="text-[clamp(0.5rem,0.85vw,0.6875rem)] text-text-tertiary truncate max-w-[60%]">
              {firstUsage.type_name ?? firstUsage.ifc_type}
            </div>
          )}
        </div>
        <div className="h-[clamp(140px,18vh,200px)] w-full overflow-hidden rounded border border-border/60">
          {firstUsage ? (
            <InlineViewer
              modelId={firstUsage.model_id}
              typeId={firstUsage.type_id}
              typeName={firstUsage.type_name}
              ifcType={firstUsage.ifc_type}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-[clamp(0.55rem,0.9vw,0.75rem)] text-white/40">
              {t('materialBrowser.detail.noModelUsage')}
            </div>
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
              <Badge
                key={n}
                variant="outline"
                className="text-[clamp(0.5rem,0.9vw,0.6875rem)] font-normal"
              >
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
        {units.length === 0 ? (
          <div
            className="mt-1 text-[clamp(0.625rem,1.1vw,0.8125rem)] text-amber-600 dark:text-amber-400"
            title={t('materialBrowser.missingValue')}
          >
            —
          </div>
        ) : (
          <div className="mt-1 space-y-0.5">
            {units.map((u) => (
              <div
                key={u}
                className="flex justify-between text-[clamp(0.625rem,1.1vw,0.8125rem)]"
              >
                <span className="text-text-secondary">{u}</span>
                <span className="font-mono font-medium text-text-primary">
                  {formatQty(material.quantities_by_unit[u])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.classification')}
        </div>
        <div className="mt-1 flex flex-col gap-1 text-[clamp(0.625rem,1.1vw,0.8125rem)]">
          <div className="flex justify-between">
            <span className="text-text-secondary">NS 3457</span>
            {material.ns3457_code ? (
              <span className="font-mono text-text-primary">
                {material.ns3457_code}
              </span>
            ) : (
              <span
                className="text-amber-600 dark:text-amber-400"
                title={t('materialBrowser.missingValue')}
              >
                —
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageTab({
  uniqueTypes,
  totalInstances,
  onNavigateToType,
}: {
  uniqueTypes: AggregatedMaterial['used_in_types'];
  totalInstances: number;
  onNavigateToType: (typeId: string, modelId: string) => void;
}) {
  const { t } = useTranslation();

  if (uniqueTypes.length === 0) {
    return (
      <div className="text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
        {t('materialBrowser.detail.usageEmpty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[clamp(0.375rem,0.8vw,0.625rem)]">
      <div className="flex items-center justify-between">
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.usedIn')}
        </div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary tabular-nums">
          {uniqueTypes.length} {t('materialBrowser.detail.types')} ·{' '}
          {totalInstances} {t('materialBrowser.detail.instances')}
        </div>
      </div>
      <div className="space-y-1">
        {uniqueTypes.slice(0, 20).map((u) => (
          <button
            key={u.type_id}
            onClick={() => onNavigateToType(u.type_id, u.model_id)}
            className="flex w-full items-center justify-between gap-2 rounded border bg-background p-[clamp(0.375rem,0.7vw,0.6rem)] text-left transition-colors hover:bg-muted/50"
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
              <span className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary tabular-nums">
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
  );
}

function ReadinessTab({ material }: { material: AggregatedMaterial }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.875rem)]">
      <ReadinessRow
        icon={<Leaf className="h-3.5 w-3.5" />}
        title={t('materialBrowser.detail.lcaReadiness')}
        ready={material.has_epd}
        readyText={t('materialBrowser.detail.lcaReady')}
        missingText={t('materialBrowser.detail.lcaMissing')}
      />
      <ReadinessRow
        icon={<ShoppingCart className="h-3.5 w-3.5" />}
        title={t('materialBrowser.detail.procurementReadiness')}
        ready={material.has_product}
        readyText={t('materialBrowser.detail.procurementReady')}
        missingText={t('materialBrowser.detail.procurementMissing')}
      />
    </div>
  );
}

function ReadinessRow({
  icon,
  title,
  ready,
  readyText,
  missingText,
}: {
  icon: React.ReactNode;
  title: string;
  ready: boolean;
  readyText: string;
  missingText: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-[clamp(0.625rem,1.2vw,0.875rem)]',
        ready
          ? 'border-[hsl(158_70%_28%/0.3)] bg-[hsl(158_70%_28%/0.04)]'
          : 'border-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={
            ready
              ? 'text-[hsl(158_70%_28%)]'
              : 'text-amber-500'
          }
        >
          {icon}
        </span>
        <div className="text-[clamp(0.625rem,1vw,0.8125rem)] font-medium text-text-primary">
          {title}
        </div>
        <div
          className={cn(
            'ml-auto h-2 w-2 rounded-full',
            ready ? 'bg-[hsl(158_70%_28%)]' : 'bg-amber-500/70',
          )}
        />
      </div>
      <div className="mt-1.5 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-secondary">
        {ready ? readyText : missingText}
      </div>
    </div>
  );
}

function formatQty(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
