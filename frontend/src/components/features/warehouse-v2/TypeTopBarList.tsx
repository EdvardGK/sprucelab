import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import type { IFCType } from '@/hooks/use-warehouse';

interface TypeTopBarListProps {
  types: IFCType[];
  topN?: number;
  fillHeight?: boolean;
}

export function TypeTopBarList({ types, topN = 10, fillHeight = false }: TypeTopBarListProps) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    return [...types]
      .filter((tp) => tp.instance_count > 0)
      .sort((a, b) => b.instance_count - a.instance_count)
      .slice(0, topN);
  }, [types, topN]);

  const maxCount = rows[0]?.instance_count ?? 0;

  return (
    <DashboardTile id="top-bar-list" className="p-[clamp(0.625rem,1.2vw,1.25rem)] flex flex-col h-full">
      <div className="flex items-center justify-between mb-[clamp(0.375rem,0.75vh,0.75rem)] flex-shrink-0">
        <h2 className="text-[clamp(0.6rem,0.8vw,0.85rem)] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('typesV2.viz.topBarTitle', { count: rows.length })}
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          {t('typesV2.viz.empty')}
        </div>
      ) : (
        <ul
          className={
            fillHeight
              ? 'flex flex-col flex-1 min-h-0 gap-2 justify-between'
              : 'flex flex-col gap-1 flex-1 min-h-0 overflow-auto pr-1'
          }
        >
          {rows.map((row) => {
            const widthPct = maxCount > 0 ? (row.instance_count / maxCount) * 100 : 0;
            return (
              <li
                key={row.id}
                className={
                  fillHeight
                    ? 'text-[clamp(0.65rem,0.8vw,0.85rem)] flex flex-col justify-center'
                    : 'text-[clamp(0.6rem,0.75vw,0.8rem)]'
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium" title={row.type_name}>
                    {row.type_name || t('typesV2.table.unnamed')}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {row.instance_count.toLocaleString()}
                  </span>
                </div>
                <div
                  className={
                    fillHeight
                      ? 'mt-1 h-[clamp(0.375rem,0.6vh,0.625rem)] w-full rounded-full bg-muted/60 overflow-hidden'
                      : 'mt-0.5 h-[clamp(0.25rem,0.4vh,0.375rem)] w-full rounded-full bg-muted/60 overflow-hidden'
                  }
                >
                  <div
                    className="h-full rounded-full bg-[hsl(158_70%_28%)] transition-[width] duration-700 ease-out"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardTile>
  );
}
