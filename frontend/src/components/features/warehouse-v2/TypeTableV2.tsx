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
  onIfcClassClick?: (ifcClass: string) => void;
  activeIfcClass?: string;
  classColors?: Map<string, string>;
  onClearFilters?: () => void;
  className?: string;
}

export function TypeTableV2({
  types,
  selectedTypeId,
  onSelectType,
  onIfcClassClick,
  activeIfcClass = 'all',
  classColors,
  onClearFilters,
  className,
}: TypeTableV2Props) {
  const { t } = useTranslation();

  return (
    <DashboardTile id="types-table" className={cn('p-0 flex flex-col', className)}>
      <div className="px-[clamp(0.625rem,1.2vw,1.25rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/60 flex items-center justify-between flex-shrink-0">
        <h2 className="text-[clamp(0.75rem,1vw,1rem)] font-medium">{t('typesV2.table.title')}</h2>
        <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums">
          {t('typesV2.filter.totalCount', { count: types.length })}
        </span>
      </div>

      {types.length === 0 ? (
        <div className="py-[clamp(2rem,5vh,4rem)] flex flex-col items-center gap-[clamp(0.5rem,1vh,1rem)] text-center text-[clamp(0.65rem,0.8vw,0.85rem)] text-muted-foreground">
          <span>{t('typesV2.table.empty')}</span>
          {onClearFilters && (activeIfcClass !== 'all') && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-[clamp(0.625rem,1vw,1rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.65rem,0.8vw,0.85rem)] font-medium hover:bg-primary/20 transition-colors"
            >
              {t('typesV2.table.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[clamp(0.65rem,0.8vw,0.85rem)] min-w-[1100px]">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-[clamp(0.25rem,0.5vw,0.5rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium w-[clamp(0.75rem,1.5vw,1.25rem)]" aria-label={t('typesV2.table.col.status')} />
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium">{t('typesV2.table.col.ifcClass')}</th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium">{t('typesV2.table.col.typeName')}</th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium text-right">{t('typesV2.table.col.instances')}</th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium">{t('typesV2.table.col.ns3451')}</th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium text-center" title={t('typesV2.props.loadBearingLong')}>
                  {t('typesV2.table.col.loadBearing')}
                </th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium text-center" title={t('typesV2.props.isExternalLong')}>
                  {t('typesV2.table.col.isExternal')}
                </th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium" title={t('typesV2.props.fireRatingLong')}>
                  {t('typesV2.table.col.fireRating')}
                </th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium" title={t('typesV2.props.acousticLong')}>
                  {t('typesV2.table.col.acoustic')}
                </th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium" title={t('typesV2.props.thermalLong')}>
                  {t('typesV2.table.col.thermal')}
                </th>
                <th className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium" title={t('typesV2.props.mmiLong')}>
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
                  onIfcClassClick={onIfcClassClick}
                  activeIfcClass={activeIfcClass}
                  classColor={classColors?.get(type.ifc_type)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardTile>
  );
}

function computeCompletenessTone(
  type: IFCType,
  props: ReturnType<typeof extractTypeProperties>
): { tone: 'good' | 'warning' | 'danger'; missing: string[] } {
  const missing: string[] = [];
  if (!type.mapping?.ns3451_code) missing.push('NS3451');
  if (props.loadBearing === null) missing.push('Load-bearing');
  if (props.isExternal === null) missing.push('External');
  if (props.fireRating === null) missing.push('Fire rating');
  if (props.acousticRating === null) missing.push('Acoustic');
  if (props.thermalTransmittance === null) missing.push('U-value');
  if (props.mmi === null) missing.push('MMI');
  if (missing.length === 0) return { tone: 'good', missing };
  if (missing.length <= 3) return { tone: 'warning', missing };
  return { tone: 'danger', missing };
}

const DOT_STYLES: Record<'good' | 'warning' | 'danger', string> = {
  good: 'bg-[hsl(158_70%_28%)]',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

function TypeRow({
  type,
  selected,
  onSelect,
  onIfcClassClick,
  activeIfcClass,
  classColor,
}: {
  type: IFCType;
  selected: boolean;
  onSelect: () => void;
  onIfcClassClick?: (ifcClass: string) => void;
  activeIfcClass?: string;
  classColor?: string;
}) {
  const { t } = useTranslation();
  const ns3451Code = type.mapping?.ns3451_code;
  const props = extractTypeProperties(type.properties);
  const completeness = computeCompletenessTone(type, props);
  const isClassActive = activeIfcClass !== 'all' && activeIfcClass === type.ifc_type;

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
      <td className="px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] relative">
        {classColor && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-[4px]"
            style={{ background: classColor }}
          />
        )}
        <span
          className={cn(
            'inline-block h-[clamp(0.4rem,0.6vw,0.625rem)] w-[clamp(0.4rem,0.6vw,0.625rem)] rounded-full ml-[clamp(0.125rem,0.2vw,0.25rem)]',
            DOT_STYLES[completeness.tone]
          )}
          title={
            completeness.missing.length === 0
              ? t('typesV2.flags.completeTooltip')
              : t('typesV2.flags.missingTooltip', {
                  fields: completeness.missing.join(', '),
                })
          }
          aria-label={
            completeness.missing.length === 0
              ? t('typesV2.flags.completeTooltip')
              : t('typesV2.flags.missingTooltip', {
                  fields: completeness.missing.join(', '),
                })
          }
        />
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-mono text-[clamp(0.6rem,0.75vw,0.8rem)] whitespace-nowrap">
        {onIfcClassClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIfcClassClick(type.ifc_type);
            }}
            className={cn(
              'rounded-sm px-1 -mx-1 transition-colors',
              isClassActive
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            title={t('typesV2.table.filterByClass', { class: type.ifc_type.replace(/^Ifc/, '') })}
          >
            {type.ifc_type.replace(/^Ifc/, '')}
          </button>
        ) : (
          <span className="text-muted-foreground">{type.ifc_type.replace(/^Ifc/, '')}</span>
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] font-medium">
        {type.type_name || (
          <span className="text-muted-foreground italic">{t('typesV2.table.unnamed')}</span>
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] text-right tabular-nums whitespace-nowrap">
        {type.instance_count.toLocaleString()}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] whitespace-nowrap">
        {ns3451Code ? (
          <Badge variant="outline" className="font-mono text-[clamp(0.6rem,0.7vw,0.75rem)]">
            {ns3451Code}
          </Badge>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] text-center">
        <BoolCell value={props.loadBearing} />
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] text-center">
        <BoolCell value={props.isExternal} />
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] whitespace-nowrap">
        {props.fireRating ? (
          <span className="font-mono text-[clamp(0.65rem,0.75vw,0.8rem)]">{props.fireRating}</span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] whitespace-nowrap">
        {props.acousticRating ? (
          <span className="font-mono text-[clamp(0.65rem,0.75vw,0.8rem)]">{props.acousticRating}</span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] whitespace-nowrap">
        {props.thermalTransmittance !== null ? (
          <span className="font-mono text-[clamp(0.65rem,0.75vw,0.8rem)] tabular-nums">
            {props.thermalTransmittance.toFixed(2)}
          </span>
        ) : (
          <MissingCell />
        )}
      </td>
      <td className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] whitespace-nowrap">
        {props.mmi !== null ? (
          <Badge variant="outline" className="font-mono text-[clamp(0.6rem,0.7vw,0.75rem)]">
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
        <Check className="h-[clamp(0.75rem,1vw,1.125rem)] w-[clamp(0.75rem,1vw,1.125rem)]" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center text-muted-foreground">
      <Minus className="h-[clamp(0.75rem,1vw,1.125rem)] w-[clamp(0.75rem,1vw,1.125rem)]" />
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
