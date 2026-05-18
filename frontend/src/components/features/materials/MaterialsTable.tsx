import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { familyColor } from './familyColors';
import {
  pickDominantUnit,
  unitRank,
  type AggregatedMaterial,
  type MaterialUnit,
} from '@/hooks/use-project-materials';

/**
 * Retained for backwards compatibility — older callers passed a `lensMode`.
 * The redesigned table renders all columns; cost/GWP auto-hide when empty.
 */
export type LensMode = 'all' | 'lca' | 'procurement';

type SortColumn =
  | 'name'
  | 'family'
  | 'quantity'
  | 'usedIn'
  | 'product'
  | 'epd'
  | 'cost'
  | 'gwp';

interface MaterialsTableProps {
  materials: AggregatedMaterial[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

interface Row {
  material: AggregatedMaterial;
  quantity: number | null;
  quantityUnit: MaterialUnit | null;
  typeCount: number;
  totalInstances: number;
  cost: number | null;
  gwp: number | null;
}

export function MaterialsTable({
  materials,
  selectedKey,
  onSelect,
}: MaterialsTableProps) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ col: SortColumn; dir: 'asc' | 'desc' }>({
    col: 'quantity',
    dir: 'desc',
  });

  const rows = useMemo<Row[]>(
    () =>
      materials.map((m) => {
        const unit = pickDominantUnit(m.quantities_by_unit);
        const qty = unit ? m.quantities_by_unit[unit] : null;
        const typeCount = new Set(m.used_in_types.map((u) => u.type_id)).size;
        const totalInstances = m.used_in_types.reduce(
          (sum, u) => sum + u.instance_count,
          0,
        );
        const cost = m.unit_cost !== null && qty !== null ? qty * m.unit_cost : null;
        const gwp =
          m.has_epd && m.gwp_per_unit !== null && qty !== null
            ? qty * m.gwp_per_unit
            : null;
        return {
          material: m,
          quantity: qty,
          quantityUnit: unit,
          typeCount,
          totalInstances,
          cost,
          gwp,
        };
      }),
    [materials],
  );

  const costAvailable = useMemo(() => rows.some((r) => r.cost !== null), [rows]);
  const gwpAvailable = useMemo(() => rows.some((r) => r.gwp !== null), [rows]);

  const sortedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Quantity sort is unit-aware: primary band by unit (m³ → m² → m →
    // kg → pcs canonical order), secondary by numeric value within the
    // band. Comparing 6.26 m³ against 16 m as raw scalars is the bug
    // reported in #17 — same row label, different physical meaning.
    if (sort.col === 'quantity') {
      return [...rows].sort((a, b) => {
        const ra = unitRank(a.quantityUnit);
        const rb = unitRank(b.quantityUnit);
        if (ra !== rb) return (ra - rb) * dir;
        const va = a.quantity ?? -Infinity;
        const vb = b.quantity ?? -Infinity;
        if (va === vb) return 0;
        return (va - vb) * dir;
      });
    }
    const get = (r: Row): string | number => {
      switch (sort.col) {
        case 'name':
          return r.material.name.toLowerCase();
        case 'family':
          return r.material.family;
        case 'quantity':
          return r.quantity ?? -Infinity;
        case 'usedIn':
          return r.typeCount;
        case 'product':
          return r.material.has_product ? 1 : 0;
        case 'epd':
          return r.material.has_epd ? 1 : 0;
        case 'cost':
          return r.cost ?? -Infinity;
        case 'gwp':
          return r.gwp ?? -Infinity;
      }
    };
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, sort]);

  const toggleSort = (col: SortColumn) => {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'name' || col === 'family' ? 'asc' : 'desc' },
    );
  };

  if (rows.length === 0) {
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
            <SortHeader
              label={t('materialBrowser.column.name')}
              col="name"
              sort={sort}
              onSort={toggleSort}
              align="left"
            />
            <SortHeader
              label={t('materialBrowser.column.family')}
              col="family"
              sort={sort}
              onSort={toggleSort}
              align="left"
            />
            <SortHeader
              label={t('materialBrowser.column.quantity')}
              col="quantity"
              sort={sort}
              onSort={toggleSort}
              align="right"
            />
            <SortHeader
              label={t('materialBrowser.column.usedIn')}
              col="usedIn"
              sort={sort}
              onSort={toggleSort}
              align="right"
            />
            <SortHeader
              label={t('materialBrowser.column.product')}
              col="product"
              sort={sort}
              onSort={toggleSort}
              align="center"
            />
            <SortHeader
              label={t('materialBrowser.column.epd')}
              col="epd"
              sort={sort}
              onSort={toggleSort}
              align="center"
            />
            {costAvailable && (
              <SortHeader
                label={t('materialBrowser.column.cost')}
                col="cost"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
            )}
            {gwpAvailable && (
              <SortHeader
                label={t('materialBrowser.column.gwp')}
                col="gwp"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <MaterialRow
              key={row.material.key}
              row={row}
              showCost={costAvailable}
              showGwp={gwpAvailable}
              selected={row.material.key === selectedKey}
              onClick={() =>
                onSelect(row.material.key === selectedKey ? null : row.material.key)
              }
            />
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
  align,
}: {
  label: string;
  col: SortColumn;
  sort: { col: SortColumn; dir: 'asc' | 'desc' };
  onSort: (col: SortColumn) => void;
  align: 'left' | 'right' | 'center';
}) {
  const isActive = sort.col === col;
  const alignClass =
    align === 'right'
      ? 'text-right justify-end'
      : align === 'center'
        ? 'text-center justify-center'
        : 'text-left justify-start';
  return (
    <th
      className={cn(
        'px-3 py-2 font-medium text-text-secondary select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-text-primary transition-colors',
          alignClass,
          isActive && 'text-text-primary',
        )}
      >
        <span>{label}</span>
        {isActive ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

function MaterialRow({
  row,
  showCost,
  showGwp,
  selected,
  onClick,
}: {
  row: Row;
  showCost: boolean;
  showGwp: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const m = row.material;
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
              style={{ background: familyColor(m.family) }}
            />
            <span className="font-medium text-text-primary truncate">{m.name}</span>
          </div>
          {m.raw_names.length > 1 && (
            <div className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary ml-3">
              +{m.raw_names.length - 1} {t('materialBrowser.aliases')}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-text-primary">
            {t(`materialBrowser.family.${m.family}`)}
          </span>
          {m.family_confidence === 'suggested' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-amber-600 dark:text-amber-400">
              {t('materialBrowser.suggested')}
            </span>
          )}
          {m.family_confidence === 'unknown' && (
            <span className="text-[clamp(0.5rem,0.8vw,0.625rem)] text-amber-600 dark:text-amber-400">
              {t('materialBrowser.unclassified')}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {row.quantity !== null && row.quantityUnit ? (
          `${formatQty(row.quantity)} ${row.quantityUnit}`
        ) : (
          <MissingDash />
        )}
      </td>
      <td className="px-3 py-2 text-right text-text-secondary">
        {row.typeCount}
        <span className="ml-1 text-[clamp(0.5rem,0.8vw,0.625rem)] text-text-tertiary">
          ({row.totalInstances})
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <ReadinessLight ready={m.has_product} />
      </td>
      <td className="px-3 py-2 text-center">
        <ReadinessLight ready={m.has_epd} />
      </td>
      {showCost && (
        <td className="px-3 py-2 text-right font-mono">
          {row.cost !== null ? (
            <span className="text-text-primary">{formatNok(row.cost)}</span>
          ) : (
            <MissingDash />
          )}
        </td>
      )}
      {showGwp && (
        <td className="px-3 py-2 text-right font-mono">
          {row.gwp !== null ? (
            <span className="text-text-primary">{formatCo2e(row.gwp)}</span>
          ) : (
            <MissingDash />
          )}
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

function MissingDash() {
  const { t } = useTranslation();
  return (
    <span
      className="text-amber-600 dark:text-amber-400"
      title={t('materialBrowser.missingValue')}
    >
      —
    </span>
  );
}

function formatQty(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function formatNok(n: number): string {
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `kr ${n.toFixed(0)}`;
  }
}

function formatCo2e(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)} t CO₂e`;
  return `${n.toFixed(0)} kg CO₂e`;
}
