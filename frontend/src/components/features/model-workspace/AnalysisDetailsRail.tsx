import { useTranslation } from 'react-i18next';
import { Layers, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import type { AnalysisTypeRecord } from '@/lib/api-types';

export interface AnalysisDetailsRailProps {
  selectedType: AnalysisTypeRecord | null;
  classColor?: string;
  onClose?: () => void;
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
    />
  );
}

function TypeDetailRail({
  type,
  classColor,
  onClose,
}: {
  type: AnalysisTypeRecord;
  classColor?: string;
  onClose?: () => void;
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
  // a "Mapped %" framing.
  const ns3451 = readNs3451(type.properties);
  const predefined = type.predefined_type ?? null;

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
