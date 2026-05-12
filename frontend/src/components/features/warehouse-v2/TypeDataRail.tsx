import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IFCType, TypeDefinitionLayer } from '@/hooks/use-warehouse';
import { extractTypeProperties } from './typeProperties';

interface TypeDataRailProps {
  selectedType: IFCType | null;
  activeIfcClass?: string;
  filteredTypeCount?: number;
  filteredInstanceCount?: number;
  classColor?: string;
}

/**
 * Narrow data rail mounted inside the viewer pane. Three states:
 * - Type selected: type-level detail (classification + key props +
 *   layer buildup + Pset explorer), compact 1-column layout.
 * - Class filter on, no type: class-level summary.
 * - Nothing: empty hint pointing the user at the table.
 */
export function TypeDataRail({
  selectedType,
  activeIfcClass = 'all',
  filteredTypeCount = 0,
  filteredInstanceCount = 0,
  classColor,
}: TypeDataRailProps) {
  const { t } = useTranslation();
  const isClassFiltered = activeIfcClass !== 'all' && !selectedType;

  if (selectedType) {
    return <TypeDetailRail type={selectedType} />;
  }

  if (isClassFiltered) {
    return (
      <ClassSummaryRail
        ifcClass={activeIfcClass}
        classColor={classColor}
        typeCount={filteredTypeCount}
        instanceCount={filteredInstanceCount}
      />
    );
  }

  return (
    <div className="h-full p-[clamp(0.75rem,1vw,1rem)] flex flex-col items-center justify-center text-center text-muted-foreground gap-[clamp(0.375rem,0.6vh,0.625rem)]">
      <Layers className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] opacity-30" />
      <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] leading-[1.4]">
        {t('typesV2.rail.emptyHint')}
      </p>
    </div>
  );
}

function TypeDetailRail({ type }: { type: IFCType }) {
  const { t } = useTranslation();
  const props = extractTypeProperties(type.properties);
  const ns3451 = type.mapping?.ns3451_code;
  const ns3451Name = type.mapping?.ns3451_name;
  const discipline = type.mapping?.discipline;
  const unit = type.mapping?.representative_unit;
  const layers = type.mapping?.definition_layers ?? [];

  return (
    <div className="p-[clamp(0.625rem,0.9vw,1rem)] flex flex-col gap-[clamp(0.625rem,1vh,1rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]">
      <RailMetric
        label={t('typesV2.rail.ifcClass')}
        value={type.ifc_type.replace(/^Ifc/, '')}
        mono
      />
      <RailMetric
        label={t('typesV2.rail.instances')}
        value={type.instance_count.toLocaleString()}
      />

      <RailSection title={t('typesV2.detail.classification')}>
        <RailField label={t('typesV2.detail.ns3451')}>
          {ns3451 ? (
            <Badge variant="outline" className="font-mono text-[clamp(0.6rem,0.7vw,0.75rem)]">
              {ns3451}
            </Badge>
          ) : (
            <Missing />
          )}
        </RailField>
        <RailField label={t('typesV2.detail.ns3451Name')}>
          {ns3451Name || <Missing />}
        </RailField>
        <RailField label={t('typesV2.detail.discipline')}>
          {discipline || <Missing />}
        </RailField>
        <RailField label={t('typesV2.detail.unit')}>
          {unit ? <span className="font-mono">{unit}</span> : <Missing />}
        </RailField>
      </RailSection>

      <RailSection title={t('typesV2.detail.keyProperties')}>
        <RailField label={t('typesV2.props.loadBearingLong')}>
          <Bool value={props.loadBearing} />
        </RailField>
        <RailField label={t('typesV2.props.isExternalLong')}>
          <Bool value={props.isExternal} />
        </RailField>
        <RailField label={t('typesV2.props.fireRatingLong')}>
          {props.fireRating ? (
            <span className="font-mono">{props.fireRating}</span>
          ) : (
            <Missing />
          )}
        </RailField>
        <RailField label={t('typesV2.props.acousticLong')}>
          {props.acousticRating ? (
            <span className="font-mono">{props.acousticRating}</span>
          ) : (
            <Missing />
          )}
        </RailField>
        <RailField label={t('typesV2.props.thermalLong')}>
          {props.thermalTransmittance !== null ? (
            <span className="font-mono tabular-nums">
              {props.thermalTransmittance.toFixed(2)}
            </span>
          ) : (
            <Missing />
          )}
        </RailField>
        <RailField label={t('typesV2.props.mmiLong')}>
          {props.mmi !== null ? (
            <Badge variant="outline" className="font-mono text-[clamp(0.6rem,0.7vw,0.75rem)]">
              {props.mmi}
            </Badge>
          ) : (
            <Missing />
          )}
        </RailField>
      </RailSection>

      {layers.length > 0 && (
        <RailSection title={t('typesV2.detail.layerBuildup')}>
          <CompactLayerStack layers={layers} />
        </RailSection>
      )}

      <PsetRailExplorer raw={type.properties} />
    </div>
  );
}

function ClassSummaryRail({
  ifcClass,
  classColor,
  typeCount,
  instanceCount,
}: {
  ifcClass: string;
  classColor?: string;
  typeCount: number;
  instanceCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-[clamp(0.625rem,0.9vw,1rem)] flex flex-col gap-[clamp(0.5rem,1vh,1rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-[clamp(0.625rem,0.9vw,0.875rem)] w-[clamp(0.625rem,0.9vw,0.875rem)] rounded"
          style={{ background: classColor ?? 'hsl(var(--muted))' }}
        />
        <span className="font-mono text-[clamp(0.7rem,0.9vw,0.95rem)] font-semibold">
          {ifcClass.replace(/^Ifc/, '')}
        </span>
      </div>
      <RailMetric label={t('typesV2.rail.types')} value={typeCount.toLocaleString()} />
      <RailMetric
        label={t('typesV2.rail.instances')}
        value={instanceCount.toLocaleString()}
      />
      <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground/80 leading-[1.45]">
        {t('typesV2.rail.classHint')}
      </p>
    </div>
  );
}

function RailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
      <h3 className="text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide font-semibold text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
        {children}
      </div>
    </section>
  );
}

function RailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground truncate">
        {label}
      </span>
      <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] truncate">{children}</span>
    </div>
  );
}

function RailMetric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0">
      <span className="text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-[clamp(0.85rem,1vw,1.05rem)] font-semibold tabular-nums',
          mono && 'font-mono'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Bool({ value }: { value: boolean | null }) {
  const { t } = useTranslation();
  if (value === null) return <Missing />;
  return (
    <span
      className={
        value
          ? 'text-[hsl(158_70%_28%)] font-medium'
          : 'text-muted-foreground'
      }
    >
      {value ? t('common.yes') : t('common.no')}
    </span>
  );
}

function Missing() {
  const { t } = useTranslation();
  return (
    <span
      className="text-amber-600/80 dark:text-amber-400/80"
      title={t('typesV2.flags.missing')}
    >
      —
    </span>
  );
}

function CompactLayerStack({ layers }: { layers: TypeDefinitionLayer[] }) {
  const totalThickness = useMemo(
    () => layers.reduce((s, l) => s + (l.thickness_mm ?? 0), 0),
    [layers]
  );
  const hasThickness = totalThickness > 0;
  return (
    <div className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
      <div className="flex h-[clamp(1.25rem,2vh,1.75rem)] w-full rounded overflow-hidden border border-border/60">
        {layers.map((layer, i) => {
          const share = hasThickness
            ? ((layer.thickness_mm ?? 0) / totalThickness) * 100
            : 100 / layers.length;
          const color = ['#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0', '#fb923c', '#f87171'][
            i % 7
          ];
          return (
            <div
              key={layer.id ?? layer.layer_order ?? i}
              style={{ width: `${share}%`, background: color, opacity: 0.85 }}
              title={`${layer.material_name}${layer.thickness_mm ? ' · ' + layer.thickness_mm + ' mm' : ''}`}
            />
          );
        })}
      </div>
      <ul className="flex flex-col gap-0.5 text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground">
        {layers.map((layer, i) => (
          <li key={layer.id ?? i} className="flex items-center gap-1.5 truncate">
            <span
              className="h-[clamp(0.45rem,0.5vw,0.55rem)] w-[clamp(0.45rem,0.5vw,0.55rem)] rounded-sm shrink-0"
              style={{
                background: ['#157954', '#C7CEE8', '#D0D34D', '#21263A', '#2dd4a0', '#fb923c', '#f87171'][i % 7],
              }}
            />
            <span className="truncate">{layer.material_name}</span>
            {layer.thickness_mm !== null && layer.thickness_mm > 0 && (
              <span className="tabular-nums shrink-0">· {layer.thickness_mm}mm</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PsetRailExplorer({ raw }: { raw: IFCType['properties'] }) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([psetName, pset]) => ({
        name: psetName,
        entries: Object.entries(pset as Record<string, unknown>).filter(
          ([, v]) => v !== null && v !== ''
        ),
      }))
      .filter((g) => g.entries.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [raw]);

  if (groups.length === 0) return null;

  return (
    <RailSection title={t('typesV2.detail.allProperties')}>
      <div className="flex flex-col gap-[clamp(0.125rem,0.25vh,0.25rem)]">
        {groups.map((group) => (
          <PsetGroupRow key={group.name} name={group.name} entries={group.entries} />
        ))}
      </div>
    </RailSection>
  );
}

function PsetGroupRow({
  name,
  entries,
}: {
  name: string;
  entries: [string, unknown][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-[clamp(0.375rem,0.6vw,0.625rem)] py-[clamp(0.2rem,0.35vh,0.4rem)] bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-[clamp(0.6rem,0.8vw,0.85rem)] w-[clamp(0.6rem,0.8vw,0.85rem)] text-muted-foreground" />
        ) : (
          <ChevronRight className="h-[clamp(0.6rem,0.8vw,0.85rem)] w-[clamp(0.6rem,0.8vw,0.85rem)] text-muted-foreground" />
        )}
        <span className="font-mono text-[clamp(0.55rem,0.7vw,0.75rem)] truncate">{name}</span>
        <span className="ml-auto text-[clamp(0.5rem,0.6vw,0.65rem)] text-muted-foreground tabular-nums">
          {entries.length}
        </span>
      </button>
      {open && (
        <dl className="px-[clamp(0.375rem,0.6vw,0.625rem)] py-[clamp(0.2rem,0.35vh,0.4rem)] flex flex-col gap-[clamp(0.1rem,0.2vh,0.2rem)] text-[clamp(0.55rem,0.7vw,0.75rem)]">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 min-w-0">
              <dt className="text-muted-foreground truncate">{k}</dt>
              <dd className="font-mono truncate">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
