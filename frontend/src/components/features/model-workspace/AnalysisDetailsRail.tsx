import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  Copy,
  EyeOff,
  Flag,
  Layers,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STATUS, type StatusKind } from '@/lib/design-tokens';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type { AnalysisTypeRecord } from '@/lib/api-types';
import type { IFCType, TypeMapping } from '@/hooks/use-warehouse';

type MappingStatus = TypeMapping['mapping_status'];

export interface AnalysisDetailsRailProps {
  selectedType: AnalysisTypeRecord | null;
  classColor?: string;
  onClose?: () => void;
  /**
   * Matched IFCType for this analysis record — looked up by signature
   * `(ifc_type === type_class, type_name)` in the parent. When present,
   * the rail renders the mapping_status pill, quick-action buttons, and
   * the notes editor. Null = no match found (raw analysis-only view).
   */
  ifcType?: IFCType | null;
  onSave?: (type: IFCType) => void;
  onFlag?: (type: IFCType) => void;
  onIgnore?: (type: IFCType) => void;
  onCopyGuid?: (type: IFCType) => void;
  onSaveNotes?: (type: IFCType, notes: string) => void;
}

/**
 * Narrow data rail that appears on the right of AnalysisDashboard when a
 * type is selected from the treemap. Visually mirrors `TypeDataRail` from
 * the Type page but built standalone — we never import from warehouse-v2
 * (the Type-page wall stays intact). Reads only the analysis-level data
 * available on `AnalysisTypeRecord` (no IFCType / mapping objects here).
 *
 * Width is owned by the parent (`w-[clamp(200px,14vw,300px)]`); this
 * component fills it.
 */
export function AnalysisDetailsRail({
  selectedType,
  classColor,
  onClose,
  ifcType,
  onSave,
  onFlag,
  onIgnore,
  onCopyGuid,
  onSaveNotes,
}: AnalysisDetailsRailProps) {
  const { t } = useTranslation();

  if (!selectedType) {
    return (
      <div className="h-full p-[clamp(0.75rem,1vw,1rem)] flex flex-col items-center justify-center text-center text-text-tertiary gap-[clamp(0.375rem,0.6vh,0.625rem)]">
        <Layers className="h-[clamp(1rem,1.5vw,1.5rem)] w-[clamp(1rem,1.5vw,1.5rem)] opacity-30" />
        <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] leading-[1.4]">
          {t('modelDash.rail.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <TypeDetailRail
      type={selectedType}
      classColor={classColor}
      onClose={onClose}
      ifcType={ifcType ?? null}
      onSave={onSave}
      onFlag={onFlag}
      onIgnore={onIgnore}
      onCopyGuid={onCopyGuid}
      onSaveNotes={onSaveNotes}
    />
  );
}

function statusToToken(status: MappingStatus | undefined | null): StatusKind {
  switch (status) {
    case 'mapped':
      return 'success';
    case 'followup':
      return 'warning';
    case 'review':
      return 'info';
    case 'ignored':
      return 'neutral';
    case 'pending':
    default:
      return 'neutral';
  }
}

function TypeDetailRail({
  type,
  classColor,
  onClose,
  ifcType,
  onSave,
  onFlag,
  onIgnore,
  onCopyGuid,
  onSaveNotes,
}: {
  type: AnalysisTypeRecord;
  classColor?: string;
  onClose?: () => void;
  ifcType: IFCType | null;
  onSave?: (type: IFCType) => void;
  onFlag?: (type: IFCType) => void;
  onIgnore?: (type: IFCType) => void;
  onCopyGuid?: (type: IFCType) => void;
  onSaveNotes?: (type: IFCType, notes: string) => void;
}) {
  const { t } = useTranslation();
  const instances = useCountUp(type.instance_count);

  // Best-effort name: the analyzer surfaces `type_class` (e.g. `IfcWallType`)
  // and a separate `element_class` (e.g. `IfcWall`). For users the friendly
  // name is the type stripped of the `Type` suffix; the element class is the
  // chip we show below.
  const friendlyName =
    type.type_name ||
    type.type_class.replace(/Type$/, '').replace(/^Ifc/, '');
  const elementClass = (type.element_class || type.type_class).replace(
    /^Ifc/,
    ''
  );

  // Material layer chips — analysis-level data only. Look in the property
  // bag for a recognised list under common pset keys; we don't fall back
  // to fake data when nothing is there (fail loud, em-dash).
  const layerChips = extractMaterialChips(type.properties);

  // NS3451 chip only if it's already populated in the property bag —
  // mapping lives on a different model (TypeMapping) which is not in the
  // analysis payload. Modelers-own-data: show em-dash when absent, never
  // a "Mapped %" framing. Prefer the resolved IFCType's mapping when
  // we have one (more authoritative than property-bag probe).
  const mapping = ifcType?.mapping ?? null;
  const ns3451 = mapping?.ns3451_code ?? readNs3451(type.properties);
  const predefined = type.predefined_type ?? null;
  const mappingStatus = mapping?.mapping_status ?? null;
  const statusToken = STATUS[statusToToken(mappingStatus)];
  const statusLabel = !mappingStatus
    ? null
    : mappingStatus === 'followup'
      ? t('modelDash.rail.status.flagged')
      : t(`modelDash.rail.status.${mappingStatus}` as const);
  const isSynthGuid =
    !ifcType?.type_guid || ifcType.type_guid.startsWith('synth_');
  const hasActions = !!ifcType && (onSave || onFlag || onIgnore || onCopyGuid);

  return (
    <div className="relative h-full p-[clamp(0.625rem,0.9vw,1rem)] flex flex-col gap-[clamp(0.625rem,1vh,1rem)] text-[clamp(0.65rem,0.8vw,0.85rem)] overflow-y-auto">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('modelDash.rail.close')}
          className="absolute top-[clamp(0.4rem,0.6vw,0.6rem)] right-[clamp(0.4rem,0.6vw,0.6rem)] p-1 text-text-tertiary hover:text-text-primary rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <X className="h-[clamp(0.7rem,1vw,0.9rem)] w-[clamp(0.7rem,1vw,0.9rem)]" />
        </button>
      )}

      <div className="flex flex-col gap-[clamp(0.2rem,0.3vh,0.3rem)]">
        <h3 className="text-[clamp(0.85rem,1.1vw,1.05rem)] font-semibold text-text-primary leading-tight pr-6 truncate">
          {friendlyName}
        </h3>
        <div className="flex items-center gap-[clamp(0.25rem,0.4vw,0.4rem)] flex-wrap">
          <span
            className="inline-block h-[clamp(0.5rem,0.7vw,0.7rem)] w-[clamp(0.5rem,0.7vw,0.7rem)] rounded"
            style={{ background: classColor ?? 'hsl(var(--muted))' }}
          />
          <Badge
            variant="outline"
            className="font-mono text-[clamp(0.55rem,0.7vw,0.7rem)]"
          >
            {elementClass}
          </Badge>
          {predefined && (
            <Badge
              variant="outline"
              className="font-mono text-[clamp(0.55rem,0.7vw,0.7rem)] text-text-secondary"
            >
              {predefined}
            </Badge>
          )}
        </div>
      </div>

      <RailMetric
        label={t('modelDash.rail.instances')}
        value={instances.toLocaleString()}
      />

      {(statusLabel || hasActions) && (
        <div className="flex flex-col gap-[clamp(0.375rem,0.6vh,0.625rem)]">
          {statusLabel && (
            <span
              className="inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[clamp(0.55rem,0.7vw,0.75rem)] font-medium border"
              style={{
                background: statusToken.bg,
                color: statusToken.text,
                borderColor: statusToken.solid,
              }}
              title={statusLabel}
            >
              <span aria-hidden="true">{statusToken.glyph}</span>
              <span>{statusLabel}</span>
            </span>
          )}
          {hasActions && ifcType && (
            <div className="flex items-center gap-1">
              {onSave && (
                <RailIconButton
                  icon={<Bookmark className="h-3.5 w-3.5" />}
                  title={t('modelDash.rail.action.save')}
                  onClick={() => onSave(ifcType)}
                />
              )}
              {onFlag && (
                <RailIconButton
                  icon={<Flag className="h-3.5 w-3.5" />}
                  title={t('modelDash.rail.action.flag')}
                  onClick={() => onFlag(ifcType)}
                />
              )}
              {onIgnore && (
                <RailIconButton
                  icon={<EyeOff className="h-3.5 w-3.5" />}
                  title={t('modelDash.rail.action.ignore')}
                  onClick={() => onIgnore(ifcType)}
                />
              )}
              <div className="flex-1" />
              {onCopyGuid && (
                <RailIconButton
                  icon={<Copy className="h-3.5 w-3.5" />}
                  title={
                    isSynthGuid
                      ? t('modelDash.rail.action.copyGuidSynth')
                      : t('modelDash.rail.action.copyGuid')
                  }
                  onClick={() => onCopyGuid(ifcType)}
                  disabled={isSynthGuid}
                />
              )}
            </div>
          )}
        </div>
      )}

      <RailSection title={t('modelDash.rail.classification')}>
        <RailField label={t('modelDash.rail.ns3451')}>
          {ns3451 ? (
            <Badge
              variant="outline"
              className="font-mono text-[clamp(0.6rem,0.7vw,0.75rem)]"
            >
              {ns3451}
            </Badge>
          ) : (
            <Missing />
          )}
        </RailField>
      </RailSection>

      <RailSection title={t('modelDash.rail.flags')}>
        <RailField label={t('modelDash.rail.empty')}>
          <Bool value={type.is_empty} positiveIsGood={false} />
        </RailField>
        <RailField label={t('modelDash.rail.proxy')}>
          <Bool value={type.is_proxy} positiveIsGood={false} />
        </RailField>
        <RailField label={t('modelDash.rail.untyped')}>
          <Bool value={type.is_untyped} positiveIsGood={false} />
        </RailField>
        <RailField label={t('modelDash.rail.representation')}>
          {type.primary_representation ? (
            <span className="font-mono truncate">
              {type.primary_representation}
            </span>
          ) : (
            <Missing />
          )}
        </RailField>
      </RailSection>

      <RailSection title={t('modelDash.rail.qualityCounters')}>
        <RailField label={t('modelDash.rail.loadbearingUnset')}>
          <Counter value={type.loadbearing_unset} />
        </RailField>
        <RailField label={t('modelDash.rail.isExternalUnset')}>
          <Counter value={type.is_external_unset} />
        </RailField>
        <RailField label={t('modelDash.rail.fireRatingUnset')}>
          <Counter value={type.fire_rating_unset} />
        </RailField>
      </RailSection>

      {layerChips.length > 0 && (
        <RailSection title={t('modelDash.rail.materials')}>
          <div className="flex flex-wrap gap-[clamp(0.2rem,0.3vw,0.35rem)]">
            {layerChips.map((chip, i) => (
              <Badge
                key={`${chip}-${i}`}
                variant="outline"
                className="text-[clamp(0.55rem,0.7vw,0.7rem)] truncate max-w-full"
                title={chip}
              >
                {chip}
              </Badge>
            ))}
          </div>
        </RailSection>
      )}

      {type.storey_distribution && type.storey_distribution.length > 0 && (
        <RailSection title={t('modelDash.rail.storeyDistribution')}>
          <ul className="flex flex-col gap-[clamp(0.1rem,0.2vh,0.2rem)]">
            {type.storey_distribution
              .slice()
              .sort((a, b) => b.instance_count - a.instance_count)
              .slice(0, 6)
              .map((sd) => (
                <li
                  key={sd.storey}
                  className="flex items-baseline justify-between gap-2 text-[clamp(0.55rem,0.7vw,0.75rem)] text-text-secondary"
                >
                  <span className="truncate">{sd.storey}</span>
                  <span className="font-mono tabular-nums">
                    {sd.instance_count.toLocaleString()}
                  </span>
                </li>
              ))}
          </ul>
        </RailSection>
      )}

      {ifcType && onSaveNotes && (
        <NotesEditor ifcType={ifcType} onSaveNotes={onSaveNotes} />
      )}

      {hasActions && (
        <div className="pt-1 text-[clamp(0.5rem,0.6vw,0.65rem)] text-text-tertiary/70 leading-[1.45] border-t border-border/40">
          {t('modelDash.rail.shortcutHint')}
        </div>
      )}
    </div>
  );
}

function NotesEditor({
  ifcType,
  onSaveNotes,
}: {
  ifcType: IFCType;
  onSaveNotes: (type: IFCType, notes: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(ifcType.mapping?.notes ?? '');
  useEffect(() => {
    setValue(ifcType.mapping?.notes ?? '');
  }, [ifcType.id, ifcType.mapping?.notes]);

  const hasMapping = !!ifcType.mapping;
  const handleBlur = () => {
    if (!hasMapping) return;
    const current = (ifcType.mapping?.notes ?? '').trim();
    if (value.trim() === current) return;
    onSaveNotes(ifcType, value);
  };

  return (
    <section className="flex flex-col gap-[clamp(0.25rem,0.4vh,0.5rem)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide font-semibold text-text-tertiary hover:text-text-primary transition-colors"
      >
        {open ? (
          <ChevronDown className="h-[clamp(0.6rem,0.8vw,0.85rem)] w-[clamp(0.6rem,0.8vw,0.85rem)]" />
        ) : (
          <ChevronRight className="h-[clamp(0.6rem,0.8vw,0.85rem)] w-[clamp(0.6rem,0.8vw,0.85rem)]" />
        )}
        <span>{t('modelDash.rail.notes.title')}</span>
        {(ifcType.mapping?.notes ?? '').trim().length > 0 && (
          <span className="ml-auto text-[clamp(0.5rem,0.6vw,0.65rem)] text-text-tertiary tabular-nums">
            ●
          </span>
        )}
      </button>
      {open && (
        <>
          {hasMapping ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleBlur}
              placeholder={t('modelDash.rail.notes.placeholder')}
              rows={3}
              className="w-full resize-y rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[clamp(0.6rem,0.75vw,0.8rem)] leading-[1.4] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-text-tertiary italic">
              {t('modelDash.rail.notes.noMapping')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function RailIconButton({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="h-[clamp(1.4rem,2vw,1.75rem)] w-[clamp(1.4rem,2vw,1.75rem)] p-0"
    >
      {icon}
    </Button>
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
      <h4 className="text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide font-semibold text-text-tertiary">
        {title}
      </h4>
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
      <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-text-tertiary truncate">
        {label}
      </span>
      <span className="text-[clamp(0.65rem,0.8vw,0.85rem)] truncate text-right">
        {children}
      </span>
    </div>
  );
}

function RailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0">
      <span className="text-[clamp(0.55rem,0.65vw,0.7rem)] uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span className="text-[clamp(0.85rem,1vw,1.05rem)] font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  );
}

function Bool({
  value,
  positiveIsGood = true,
}: {
  value: boolean | null;
  /** When false, `true` is a warning (e.g. is_proxy=true is bad). */
  positiveIsGood?: boolean;
}) {
  const { t } = useTranslation();
  if (value === null) return <Missing />;
  const isGood = positiveIsGood ? value : !value;
  return (
    <span
      className={cn(
        'font-medium',
        isGood
          ? 'text-[hsl(158_70%_28%)]'
          : 'text-amber-600 dark:text-amber-400'
      )}
    >
      {value ? t('common.yes') : t('common.no')}
    </span>
  );
}

function Counter({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="text-[hsl(158_70%_28%)] font-medium">0</span>
    );
  }
  return (
    <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">
      {value.toLocaleString()}
    </span>
  );
}

function Missing() {
  const { t } = useTranslation();
  return (
    <span
      className="text-amber-600/80 dark:text-amber-400/80"
      title={t('modelDash.rail.missing')}
    >
      —
    </span>
  );
}

/**
 * Probe the analysis-extracted property bag for common material-name keys.
 * Returns a deduped list of short labels — no synthesis, no fake data.
 */
function extractMaterialChips(
  raw: Record<string, unknown> | undefined | null
): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  // Top-level "material" or "materials" key shapes vary by extractor.
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    const keyLower = k.toLowerCase();
    if (
      keyLower === 'material' ||
      keyLower === 'materials' ||
      keyLower === 'material_layers' ||
      keyLower === 'layers'
    ) {
      if (typeof v === 'string') push(v);
      else if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string') push(item);
          else if (item && typeof item === 'object') {
            const m = item as Record<string, unknown>;
            push(m.material_name ?? m.name ?? m.material);
          }
        }
      }
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const pset = v as Record<string, unknown>;
      // Common Pset_*Common.Material patterns.
      push(pset.Material);
      push(pset.material);
    }
  }
  return out.slice(0, 8);
}

function readNs3451(
  raw: Record<string, unknown> | undefined | null
): string | null {
  if (!raw || typeof raw !== 'object') return null;
  for (const v of Object.values(raw)) {
    if (!v || typeof v !== 'object') continue;
    const pset = v as Record<string, unknown>;
    const candidate =
      pset['NS3451'] ??
      pset['NS-3451'] ??
      pset['ns3451'] ??
      pset['Classification'];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}
