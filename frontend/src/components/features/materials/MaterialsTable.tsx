import { useTranslation } from 'react-i18next';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { familyColor } from './familyColors';
import type {
  AggregatedMaterial,
  MaterialUnit,
} from '@/hooks/use-project-materials';

export type LensMode = 'all' | 'lca' | 'procurement';

interface MaterialsTableProps {
  materials: AggregatedMaterial[];
  lens: LensMode;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

export function MaterialsTable({
  materials,
  lens,
  selectedKey,
  onSelect,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  if (materials.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[clamp(0.625rem,1vw,0.75rem)] text-text-tertiary">
        {t('materialBrowser.noResults')}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
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
          {materials.map((m) => (
            <MaterialRow
              key={m.key}
              material={m}
              lens={lens}
              selected={m.key === selectedKey}
              onClick={() => onSelect(m.key === selectedKey ? null : m.key)}
            />
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

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
  const totalInstances = material.used_in_types.reduce(
    (sum, u) => sum + u.instance_count,
    0,
  );

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
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[clamp(0.4rem,0.55vw,0.55rem)] w-[clamp(0.4rem,0.55vw,0.55rem)] rounded-sm shrink-0"
              style={{ background: familyColor(material.family) }}
            />
            <span className="font-medium text-text-primary truncate">
              {material.name}
            </span>
          </div>
          {material.raw_names.length > 1 && (
            <div className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary ml-3">
              +{material.raw_names.length - 1} {t('materialBrowser.aliases')}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-text-primary">
            {t(`materialBrowser.family.${material.family}`)}
          </span>
          {material.family_confidence === 'suggested' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-amber-600 dark:text-amber-400">
              {t('materialBrowser.suggested')}
            </span>
          )}
          {material.family_confidence === 'unknown' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-amber-600 dark:text-amber-400">
              {t('materialBrowser.unclassified')}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {primaryQty ? (
          `${formatQty(primaryQty.value)} ${primaryQty.unit}`
        ) : (
          <span
            className="text-amber-600 dark:text-amber-400"
            title={t('materialBrowser.missingValue')}
          >
            —
          </span>
        )}
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
        ready ? 'bg-[hsl(158_70%_28%)]' : 'bg-amber-500/70',
      )}
      title={ready ? 'linked' : 'missing'}
    />
  );
}

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
