import { useTranslation } from 'react-i18next';

import { DashboardTile } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IFCType } from '@/hooks/use-warehouse';

interface TypeTableV2Props {
  types: IFCType[];
}

export function TypeTableV2({ types }: TypeTableV2Props) {
  const { t } = useTranslation();

  return (
    <DashboardTile id="types-table" className="p-0">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('typesV2.table.title')}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('typesV2.filter.totalCount', { count: types.length })}
        </span>
      </div>

      {types.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          {t('typesV2.table.empty')}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 sticky top-0">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t('typesV2.table.col.ifcClass')}</th>
                <th className="px-4 py-2 font-medium">{t('typesV2.table.col.typeName')}</th>
                <th className="px-4 py-2 font-medium text-right">{t('typesV2.table.col.instances')}</th>
                <th className="px-4 py-2 font-medium">{t('typesV2.table.col.ns3451')}</th>
                <th className="px-4 py-2 font-medium">{t('typesV2.table.col.status')}</th>
                <th className="px-4 py-2 font-medium w-32">{t('typesV2.table.col.coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <TypeRow key={type.id} type={type} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardTile>
  );
}

function TypeRow({ type }: { type: IFCType }) {
  const { t } = useTranslation();
  const status = type.mapping?.mapping_status ?? 'pending';
  const ns3451Code = type.mapping?.ns3451_code;
  const verificationStatus = type.mapping?.verification_status ?? 'pending';
  const coveragePct = computeCoverage(type);

  return (
    <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2 font-mono text-[0.7rem] text-muted-foreground">
        {type.ifc_type.replace(/^Ifc/, '')}
      </td>
      <td className="px-4 py-2 font-medium">
        {type.type_name || <span className="text-muted-foreground italic">{t('typesV2.table.unnamed')}</span>}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {type.instance_count.toLocaleString()}
      </td>
      <td className="px-4 py-2">
        {ns3451Code ? (
          <Badge variant="outline" className="font-mono text-[0.65rem]">
            {ns3451Code}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <StatusPill status={status} verification={verificationStatus} />
      </td>
      <td className="px-4 py-2">
        <CoverageStrip percent={coveragePct} />
      </td>
    </tr>
  );
}

function StatusPill({
  status,
  verification,
}: {
  status: 'pending' | 'mapped' | 'ignored' | 'review' | 'followup';
  verification: 'pending' | 'auto' | 'verified' | 'flagged';
}) {
  const { t } = useTranslation();
  if (verification === 'flagged') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 text-[0.65rem] font-medium">
        {t('status.flagged')}
      </span>
    );
  }
  if (verification === 'verified') {
    return (
      <span className="inline-flex items-center rounded-full bg-[hsl(158_70%_28%/0.15)] text-[hsl(158_70%_28%)] px-2 py-0.5 text-[0.65rem] font-medium">
        {t('status.verified')}
      </span>
    );
  }
  const styleMap: Record<typeof status, string> = {
    mapped: 'bg-[hsl(158_70%_28%/0.15)] text-[hsl(158_70%_28%)]',
    pending: 'bg-muted text-muted-foreground',
    ignored: 'bg-muted/60 text-muted-foreground',
    review: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    followup: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium',
        styleMap[status]
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

function CoverageStrip({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color =
    clamped >= 80
      ? 'bg-[hsl(158_70%_28%)]'
      : clamped >= 40
      ? 'bg-amber-500'
      : 'bg-muted-foreground/40';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[0.65rem] tabular-nums text-muted-foreground w-8 text-right">
        {clamped}%
      </span>
    </div>
  );
}

function computeCoverage(type: IFCType): number {
  const mapping = type.mapping;
  if (!mapping) return 0;
  let filled = 0;
  let total = 4;
  if (mapping.ns3451_code) filled += 1;
  if (mapping.representative_unit) filled += 1;
  if ((mapping.definition_layers?.length ?? 0) > 0) filled += 1;
  if (mapping.verification_status === 'verified') filled += 1;
  return Math.round((filled / total) * 100);
}
