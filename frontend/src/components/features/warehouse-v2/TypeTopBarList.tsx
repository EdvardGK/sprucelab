import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import type { IFCType } from '@/hooks/use-warehouse';

interface TypeTopBarListProps {
  types: IFCType[];
  topN?: number;
}

export function TypeTopBarList({ types, topN = 20 }: TypeTopBarListProps) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    return [...types]
      .filter((tp) => tp.instance_count > 0)
      .sort((a, b) => b.instance_count - a.instance_count)
      .slice(0, topN);
  }, [types, topN]);

  const maxCount = rows[0]?.instance_count ?? 0;

  return (
    <DashboardTile id="top-bar-list" className="p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h2 className="text-xs font-medium">
          {t('typesV2.viz.topBarTitle', { count: topN })}
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          {t('typesV2.viz.empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-1 flex-1 min-h-0 overflow-auto pr-1">
          {rows.map((row) => {
            const widthPct = maxCount > 0 ? (row.instance_count / maxCount) * 100 : 0;
            return (
              <li key={row.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium" title={row.type_name}>
                    {row.type_name || t('typesV2.table.unnamed')}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {row.instance_count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(158_70%_28%)]"
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
