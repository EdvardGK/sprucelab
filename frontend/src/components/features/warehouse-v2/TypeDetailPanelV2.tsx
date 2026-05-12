import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FileSearch, X } from 'lucide-react';

import { DashboardTile } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { IFCType, TypeDefinitionLayer } from '@/hooks/use-warehouse';
import { extractTypeProperties } from './typeProperties';

interface TypeDetailPanelV2Props {
  type: IFCType | null;
  onClose: () => void;
  className?: string;
}

export function TypeDetailPanelV2({ type, onClose, className }: TypeDetailPanelV2Props) {
  const { t } = useTranslation();

  if (!type) return null;

  const props = extractTypeProperties(type.properties);

  return (
    <DashboardTile
      id="type-detail-panel"
      className={cn('p-0 flex flex-col h-full', className)}
    >
      <header className="flex items-start justify-between gap-[clamp(0.5rem,1vw,1rem)] px-[clamp(0.625rem,1.2vw,1.25rem)] py-[clamp(0.5rem,0.8vh,0.75rem)] border-b border-border/60 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-baseline gap-[clamp(0.375rem,0.6vw,0.75rem)] flex-wrap">
            <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] font-mono text-muted-foreground">
              {type.ifc_type.replace(/^Ifc/, '')}
            </span>
            <h2 className="text-[clamp(0.875rem,1.2vw,1.125rem)] font-semibold truncate">
              {type.type_name || t('typesV2.table.unnamed')}
            </h2>
            <span className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums">
              {t('typesV2.detail.instanceCount', { count: type.instance_count })}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-[clamp(1.25rem,1.75vw,1.75rem)] w-[clamp(1.25rem,1.75vw,1.75rem)] p-0 shrink-0"
          title={t('typesV2.viewer.clear')}
        >
          <X className="h-[clamp(0.75rem,1vw,1rem)] w-[clamp(0.75rem,1vw,1rem)]" />
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-[clamp(0.625rem,1.2vw,1.25rem)] flex flex-col gap-[clamp(0.75rem,1.2vh,1.25rem)]">
        <Section title={t('typesV2.detail.classification')}>
          <ClassificationTriple type={type} />
        </Section>

        <Section title={t('typesV2.detail.keyProperties')}>
          <KeyPropertiesGrid props={props} />
        </Section>

        {type.mapping?.definition_layers && type.mapping.definition_layers.length > 0 && (
          <Section title={t('typesV2.detail.layerBuildup')}>
            <LayerSandwich layers={type.mapping.definition_layers} />
          </Section>
        )}

        <PsetExplorer raw={type.properties} />
      </div>
    </DashboardTile>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[clamp(0.375rem,0.6vh,0.625rem)]">
      <h3 className="text-[clamp(0.6rem,0.75vw,0.8rem)] uppercase tracking-wide font-semibold text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ClassificationTriple({ type }: { type: IFCType }) {
  const { t } = useTranslation();
  const code = type.mapping?.ns3451_code ?? null;
  const name = type.mapping?.ns3451_name ?? null;
  const discipline = type.mapping?.discipline ?? null;
  const unit = type.mapping?.representative_unit ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
      <Field label={t('typesV2.detail.ns3451')}>
        {code ? (
          <Badge variant="outline" className="font-mono text-[clamp(0.65rem,0.8vw,0.85rem)]">
            {code}
          </Badge>
        ) : (
          <MissingValue />
        )}
      </Field>
      <Field label={t('typesV2.detail.ns3451Name')}>
        {name || <MissingValue />}
      </Field>
      <Field label={t('typesV2.detail.discipline')}>
        {discipline || <MissingValue />}
      </Field>
      <Field label={t('typesV2.detail.unit')}>
        {unit ? (
          <span className="font-mono text-[clamp(0.65rem,0.8vw,0.85rem)]">{unit}</span>
        ) : (
          <MissingValue />
        )}
      </Field>
    </div>
  );
}

function KeyPropertiesGrid({
  props,
}: {
  props: ReturnType<typeof extractTypeProperties>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-[clamp(0.5rem,1vw,1rem)]">
      <Field label={t('typesV2.props.loadBearingLong')}>
        <BoolValue value={props.loadBearing} />
      </Field>
      <Field label={t('typesV2.props.isExternalLong')}>
        <BoolValue value={props.isExternal} />
      </Field>
      <Field label={t('typesV2.props.fireRatingLong')}>
        {props.fireRating ? (
          <span className="font-mono text-[clamp(0.7rem,0.85vw,0.95rem)]">{props.fireRating}</span>
        ) : (
          <MissingValue />
        )}
      </Field>
      <Field label={t('typesV2.props.acousticLong')}>
        {props.acousticRating ? (
          <span className="font-mono text-[clamp(0.7rem,0.85vw,0.95rem)]">{props.acousticRating}</span>
        ) : (
          <MissingValue />
        )}
      </Field>
      <Field label={t('typesV2.props.thermalLong')}>
        {props.thermalTransmittance !== null ? (
          <span className="font-mono text-[clamp(0.7rem,0.85vw,0.95rem)] tabular-nums">
            {props.thermalTransmittance.toFixed(2)}
          </span>
        ) : (
          <MissingValue />
        )}
      </Field>
      <Field label={t('typesV2.props.mmiLong')}>
        {props.mmi !== null ? (
          <Badge variant="outline" className="font-mono text-[clamp(0.65rem,0.8vw,0.85rem)]">
            {props.mmi}
          </Badge>
        ) : (
          <MissingValue />
        )}
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[clamp(0.125rem,0.25vh,0.25rem)] min-w-0">
      <span className="text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-[clamp(0.75rem,0.9vw,1rem)] truncate">{children}</span>
    </div>
  );
}

function BoolValue({ value }: { value: boolean | null }) {
  const { t } = useTranslation();
  if (value === null) return <MissingValue />;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[clamp(0.7rem,0.85vw,0.95rem)]',
        value ? 'text-[hsl(158_70%_28%)]' : 'text-muted-foreground'
      )}
    >
      {value ? t('common.yes') : t('common.no')}
    </span>
  );
}

function MissingValue() {
  const { t } = useTranslation();
  return (
    <span
      className="text-amber-600/80 dark:text-amber-400/80 text-[clamp(0.65rem,0.8vw,0.85rem)]"
      title={t('typesV2.flags.missing')}
    >
      —
    </span>
  );
}

function LayerSandwich({ layers }: { layers: TypeDefinitionLayer[] }) {
  const totalThickness = useMemo(
    () => layers.reduce((s, l) => s + (l.thickness_mm ?? 0), 0),
    [layers]
  );
  // Fallback equal-share when thickness not provided
  const hasThickness = totalThickness > 0;
  return (
    <div className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
      <div className="flex h-[clamp(2rem,4vh,3rem)] w-full rounded-md overflow-hidden border border-border/60">
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
              className="flex items-center justify-center text-[clamp(0.55rem,0.65vw,0.7rem)] text-white px-1 truncate"
              title={`${layer.material_name}${layer.thickness_mm ? ' · ' + layer.thickness_mm + ' mm' : ''}`}
            >
              <span className="truncate">{layer.material_name}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-[clamp(0.5rem,0.8vw,1rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground tabular-nums">
        {layers.map((layer, i) => (
          <span key={layer.id ?? i} className="inline-flex items-center gap-1">
            <span className="h-[0.6rem] w-[0.6rem] rounded-sm" style={{ background: ['#157954','#C7CEE8','#D0D34D','#21263A','#2dd4a0','#fb923c','#f87171'][i%7] }} />
            <span>{layer.material_name}</span>
            {layer.thickness_mm !== null && layer.thickness_mm > 0 && (
              <span>· {layer.thickness_mm}mm</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function PsetExplorer({ raw }: { raw: IFCType['properties'] }) {
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
    <Section title={t('typesV2.detail.allProperties')}>
      <div className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
        {groups.map((group) => (
          <PsetGroup key={group.name} name={group.name} entries={group.entries} />
        ))}
      </div>
    </Section>
  );
}

function PsetGroup({
  name,
  entries,
}: {
  name: string;
  entries: [string, unknown][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-[clamp(0.25rem,0.4vw,0.5rem)] px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.25rem,0.5vh,0.5rem)] bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-[clamp(0.7rem,0.9vw,0.95rem)] w-[clamp(0.7rem,0.9vw,0.95rem)] text-muted-foreground" />
        ) : (
          <ChevronRight className="h-[clamp(0.7rem,0.9vw,0.95rem)] w-[clamp(0.7rem,0.9vw,0.95rem)] text-muted-foreground" />
        )}
        <FileSearch className="h-[clamp(0.7rem,0.9vw,0.95rem)] w-[clamp(0.7rem,0.9vw,0.95rem)] text-muted-foreground shrink-0" />
        <span className="font-mono text-[clamp(0.65rem,0.8vw,0.85rem)] truncate">{name}</span>
        <span className="ml-auto text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
          {entries.length}
        </span>
      </button>
      {open && (
        <dl className="px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] grid grid-cols-1 md:grid-cols-2 gap-x-[clamp(0.75rem,1.5vw,1.5rem)] gap-y-[clamp(0.125rem,0.25vh,0.25rem)] text-[clamp(0.65rem,0.8vw,0.85rem)]">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 min-w-0">
              <dt className="text-muted-foreground shrink-0">{k}</dt>
              <dd className="font-mono truncate ml-auto">{formatValue(v)}</dd>
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
