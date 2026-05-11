import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IFCType } from '@/hooks/use-warehouse';

import { extractTypeProperties } from './typeProperties';

interface TypeTableV2Props {
  types: IFCType[];
  selectedTypeId: string | null;
  onSelectType: (id: string) => void;
  className?: string;
}

export function TypeTableV2({
  types,
  selectedTypeId,
  onSelectType,
  className,
}: TypeTableV2Props) {
  const { t } = useTranslation();

  return (
    <DashboardTile id="types-table" className={cn('p-0 flex flex-col', className)}>
      <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between flex-shrink-0">
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
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('typesV2.table.col.ifcClass')}</th>
                <th className="px-3 py-2 font-medium">{t('typesV2.table.col.typeName')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('typesV2.table.col.instances')}</th>
                <th className="px-3 py-2 font-medium">{t('typesV2.table.col.ns3451')}</th>
                <th className="px-3 py-2 font-medium text-center" title={t('typesV2.props.loadBearingLong')}>
                  {t('typesV2.table.col.loadBearing')}
                </th>
                <th className="px-3 py-2 font-medium text-center" title={t('typesV2.props.isExternalLong')}>
                  {t('typesV2.table.col.isExternal')}
                </th>
                <th className="px-3 py-2 font-medium" title={t('typesV2.props.fireRatingLong')}>
                  {t('typesV2.table.col.fireRating')}
                </th>
                <th className="px-3 py-2 font-medium" title={t('typesV2.props.acousticLong')}>
                  {t('typesV2.table.col.acoustic')}
                </th>
                <th className="px-3 py-2 font-medium" title={t('typesV2.props.thermalLong')}>
                  {t('typesV2.table.col.thermal')}
                </th>
                <th className="px-3 py-2 font-medium" title={t('typesV2.props.mmiLong')}>
                  {t('typesV2.table.col.mmi')}
                </th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <TypeRow
                  key={type.id}
                  type={type}
                  selected={type.id === selectedTypeId}
                  onSelect={() => onSelectType(type.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardTile>
  );
}

function TypeRow({
  type,
  selected,
  onSelect,
}: {
  type: IFCType;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const ns3451Code = type.mapping?.ns3451_code;
  const props = extractTypeProperties(type.properties);

  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      className={cn(
        'border-b border-border/40 cursor-pointer transition-colors outline-none',
        selected
          ? 'bg-primary/10 hover:bg-primary/15'
          : 'hover:bg-muted/30 focus:bg-muted/30'
      )}
    >
      <td className="px-3 py-2 font-mono text-[0.7rem] text-muted-foreground whitespace-nowrap">
        {type.ifc_type.replace(/^Ifc/, '')}
      </td>
      <td className="px-3 py-2 font-medium">
        {type.type_name || (
          <span className="text-muted-foreground italic">{t('typesV2.table.unnamed')}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
        {type.instance_count.toLocaleString()}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {ns3451Code ? (
          <Badge variant="outline" className="font-mono text-[0.65rem]">
            {ns3451Code}
          </Badge>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <BoolCell value={props.loadBearing} />
      </td>
      <td className="px-3 py-2 text-center">
        <BoolCell value={props.isExternal} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {props.fireRating ? (
          <span className="font-mono text-[0.7rem]">{props.fireRating}</span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {props.acousticRating ? (
          <span className="font-mono text-[0.7rem]">{props.acousticRating}</span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {props.thermalTransmittance !== null ? (
          <span className="font-mono text-[0.7rem] tabular-nums">
            {props.thermalTransmittance.toFixed(2)}
          </span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {props.mmi !== null ? (
          <Badge variant="outline" className="font-mono text-[0.65rem]">
            {props.mmi}
          </Badge>
        ) : (
          <MissingCell />
        )}
      </td>
    </tr>
  );
}

function BoolCell({ value }: { value: boolean | null }) {
  if (value === null) return <MissingCell />;
  if (value) {
    return (
      <span className="inline-flex items-center justify-center text-[hsl(158_70%_28%)]">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center text-muted-foreground">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

function MissingCell() {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center text-amber-600/80 dark:text-amber-400/80 text-[0.65rem]"
      title={t('typesV2.flags.missing')}
    >
      —
    </span>
  );
}
