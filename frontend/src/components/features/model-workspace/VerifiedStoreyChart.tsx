import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { DrillTarget } from '@/components/filters/DrillTarget';
import type {
  AnalysisStorey,
  ModelStoreyVerification,
  StoreyVerificationStatus,
  VerifiedModelStorey,
  MissingCanonicalFloor,
} from '@/lib/api-types';

/**
 * Storey card chart: IFC products per storey + canonical-floor verification
 * overlay. Bars stay the dominant data dimension (matches the Elements
 * treemap), with verification status communicated through a per-row
 * status edge and a header progress ring. Missing canonical floors
 * render as ghost rows.
 *
 * When `verification` is null OR `has_canonical` is false, falls back
 * to plain bars — modelers-own-data, no big warning text.
 */
export interface VerifiedStoreyChartProps {
  /** Analysis storey rows used when verification hasn't loaded yet. */
  storeys: AnalysisStorey[];
  /** Verification payload from /api/models/{id}/storey-verification/. */
  verification: ModelStoreyVerification | null | undefined;
  /** Active storey for cross-filter highlight. Matches against guid when available, else name. */
  activeStorey?: string | null;
  /** Click handler for cross-filter; receives storey GUID when available, else name. Omit to render non-interactive. */
  onBarClick?: (storeyKey: string | null) => void;
}

const STATUS_COLOR_CLASS: Record<NonNullable<StoreyVerificationStatus>, string> = {
  matched: 'bg-[hsl(158_70%_28%)]',
  rename: 'bg-amber-500',
  deviating: 'bg-red-500',
};

const STATUS_LABEL_KEY: Record<NonNullable<StoreyVerificationStatus>, string> = {
  matched: 'modelDash.storeys.statusMatched',
  rename: 'modelDash.storeys.statusRename',
  deviating: 'modelDash.storeys.statusDeviating',
};

export function VerifiedStoreyChart({
  storeys,
  verification,
  activeStorey,
  onBarClick,
}: VerifiedStoreyChartProps) {
  const { t } = useTranslation();

  // Source-of-truth: verification.model_storeys when available, else fall back
  // to the analysis storey rows. Both shapes carry name/elevation/element_count.
  const rows: VerifiedModelStorey[] = verification?.model_storeys?.length
    ? verification.model_storeys
    : storeys.map((s) => ({
        guid: null,
        name: s.name,
        elevation: s.elevation,
        element_count: s.element_count,
        status: null,
        canonical_code: null,
        canonical_name: null,
        elevation_delta_m: null,
      }));

  const missing: MissingCanonicalFloor[] = verification?.missing_canonical ?? [];

  const orphanCount = verification?.orphan_count ?? 0;

  if (!rows.length && !missing.length && orphanCount === 0) {
    return <div className="text-text-tertiary text-xs">{t('modelDash.storeys.empty')}</div>;
  }

  const sortedRows = [...rows].sort(
    (a, b) => (b.elevation ?? -Infinity) - (a.elevation ?? -Infinity)
  );
  const sortedMissing = [...missing].sort(
    (a, b) => (b.elevation_m ?? -Infinity) - (a.elevation_m ?? -Infinity)
  );

  const maxCount = Math.max(
    ...sortedRows.map((s) => s.element_count),
    orphanCount,
    1
  );

  // Merge model storeys + missing canonical rows into a single visual list,
  // sorted by elevation top-down. Missing rows render as ghost bars.
  type Row =
    | { kind: 'model'; row: VerifiedModelStorey }
    | { kind: 'missing'; row: MissingCanonicalFloor };
  const combined: Row[] = [
    ...sortedRows.map<Row>((row) => ({ kind: 'model', row })),
    ...sortedMissing.map<Row>((row) => ({ kind: 'missing', row })),
  ].sort((a, b) => {
    const elevA = a.kind === 'model' ? a.row.elevation : a.row.elevation_m;
    const elevB = b.kind === 'model' ? b.row.elevation : b.row.elevation_m;
    return (elevB ?? -Infinity) - (elevA ?? -Infinity);
  });

  return (
    <div className="flex flex-col gap-[clamp(0.25rem,0.6vw,0.5rem)]">
      {verification?.has_canonical && (
        <VerificationHeader
          matched={verification.matched_count}
          total={verification.canonical_count}
          rows={sortedRows}
          missingCount={sortedMissing.length}
        />
      )}

      <div className="space-y-[clamp(0.1rem,0.3vw,0.2rem)]">
        {combined.map((entry) =>
          entry.kind === 'model' ? (
            <ModelStoreyRow
              key={`m:${entry.row.name}`}
              row={entry.row}
              maxCount={maxCount}
              activeStorey={activeStorey}
              onBarClick={onBarClick}
              statusLabelKey={
                entry.row.status ? STATUS_LABEL_KEY[entry.row.status] : null
              }
              t={t}
            />
          ) : (
            <MissingCanonicalRow key={`c:${entry.row.name ?? entry.row.code ?? Math.random()}`} row={entry.row} t={t} />
          )
        )}

        {orphanCount > 0 && (
          <OrphanRow count={orphanCount} maxCount={maxCount} t={t} />
        )}
      </div>
    </div>
  );
}

// ─── Header — progress ring + summary tone ─────────────────────────────────

function VerificationHeader({
  matched,
  total,
  rows,
  missingCount,
}: {
  matched: number;
  total: number;
  rows: VerifiedModelStorey[];
  missingCount: number;
}) {
  const { t } = useTranslation();
  const deviatingCount = rows.filter((r) => r.status === 'deviating').length;
  const renameCount = rows.filter((r) => r.status === 'rename').length;

  const tone: 'good' | 'warning' | 'danger' =
    deviatingCount > 0
      ? 'danger'
      : renameCount > 0 || missingCount > 0
      ? 'warning'
      : 'good';

  const ringColor =
    tone === 'good'
      ? 'hsl(158 70% 28%)'
      : tone === 'warning'
      ? 'hsl(38 92% 50%)'
      : 'hsl(0 84% 60%)';

  const Icon = tone === 'good' ? CheckCircle2 : AlertTriangle;
  const iconColor =
    tone === 'good'
      ? 'text-[hsl(158_70%_28%)]'
      : tone === 'warning'
      ? 'text-amber-500'
      : 'text-red-500';

  // SVG progress ring — purely visual (no text inside).
  const size = 18;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? matched / total : 0;

  return (
    <div className="flex items-center gap-[clamp(0.3rem,0.6vw,0.5rem)]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        aria-label={t('modelDash.storeys.matchedRing', { matched, total })}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(220 10% 30% / 0.35)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 350ms ease' }}
        />
      </svg>
      <Icon className={cn('h-[clamp(0.7rem,1vw,0.875rem)] w-[clamp(0.7rem,1vw,0.875rem)]', iconColor)} />
    </div>
  );
}

// ─── Per-storey row ─────────────────────────────────────────────────────────

interface ModelStoreyRowProps {
  row: VerifiedModelStorey;
  maxCount: number;
  activeStorey?: string | null;
  onBarClick?: (storeyKey: string | null) => void;
  statusLabelKey: string | null;
  t: (key: string) => string;
}

function ModelStoreyRow({
  row,
  maxCount,
  activeStorey,
  onBarClick,
  statusLabelKey,
  t,
}: ModelStoreyRowProps) {
  // Prefer GUID as the cross-filter key — robust against name divergence
  // between fragments-v3 metadata and the deep analysis. Fall back to name
  // for legacy analyses that pre-date AnalysisStorey.guid.
  const filterKey = row.guid ?? row.name;
  const isActive = activeStorey === filterKey;

  // Status edge color (left bar). Falls back to subtle grey when no canonical.
  const edgeClass = row.status
    ? STATUS_COLOR_CLASS[row.status]
    : 'bg-white/15';

  const barFill = row.status
    ? STATUS_COLOR_CLASS[row.status]
    : 'bg-gradient-to-r from-navy to-forest';

  const inner = (
    <div
      className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.5rem,0.9vw,0.65rem)]"
      style={{ gridTemplateColumns: '3px minmax(0, 5rem) auto 1fr auto' }}
    >
      <span className={cn('h-full w-[3px] rounded-sm', edgeClass)} aria-hidden />
      <span className="text-text-secondary truncate" title={row.name}>{row.name}</span>
      <span className="text-text-tertiary tabular-nums w-[3.5em] text-right">
        {row.elevation != null ? `${row.elevation.toFixed(1)}m` : '—'}
      </span>
      <div
        className="h-[clamp(0.7rem,1.2vw,1rem)] bg-white/5 rounded overflow-hidden"
        title={
          statusLabelKey
            ? `${t(statusLabelKey)}${
                row.canonical_name ? ` · ${row.canonical_name}` : ''
              }${
                row.elevation_delta_m != null
                  ? ` · Δ ${row.elevation_delta_m >= 0 ? '+' : ''}${row.elevation_delta_m.toFixed(2)}m`
                  : ''
              }`
            : undefined
        }
      >
        <div
          className={cn('h-full rounded transition-all', barFill)}
          style={{ width: `${(row.element_count / maxCount) * 100}%` }}
        />
      </div>
      <span className="text-text-primary tabular-nums font-medium w-[3em] text-right">
        {row.element_count.toLocaleString()}
      </span>
    </div>
  );

  if (!onBarClick) {
    return <div>{inner}</div>;
  }
  return (
    <DrillTarget
      ariaLabel={`Filter by storey ${row.name}`}
      active={isActive}
      onActivate={() => onBarClick(isActive ? null : filterKey)}
      className="rounded"
    >
      {inner}
    </DrillTarget>
  );
}

// ─── Ghost row — canonical floor not present in this model ──────────────────

function MissingCanonicalRow({
  row,
  t,
}: {
  row: MissingCanonicalFloor;
  t: (key: string) => string;
}) {
  const label = row.name || row.code || '—';
  return (
    <div
      className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.5rem,0.9vw,0.65rem)] opacity-50"
      style={{ gridTemplateColumns: '3px minmax(0, 5rem) auto 1fr auto' }}
      title={t('modelDash.storeys.missingCanonical')}
    >
      <span className="h-full w-[3px] rounded-sm bg-amber-500" aria-hidden />
      <span className="text-text-secondary truncate italic" title={label}>{label}</span>
      <span className="text-text-tertiary tabular-nums w-[3.5em] text-right">
        {row.elevation_m != null ? `${row.elevation_m.toFixed(1)}m` : '—'}
      </span>
      <div className="h-[clamp(0.7rem,1.2vw,1rem)] bg-white/5 rounded overflow-hidden">
        <div className="h-full w-0 bg-amber-500/30" />
      </div>
      <span className="text-text-tertiary tabular-nums w-[3em] text-right">—</span>
    </div>
  );
}

// ─── Orphan row — products outside spatial hierarchy ────────────────────────

function OrphanRow({
  count,
  maxCount,
  t,
}: {
  count: number;
  maxCount: number;
  t: (key: string) => string;
}) {
  return (
    <div
      className="grid items-center gap-[clamp(0.3rem,0.6vw,0.5rem)] text-[clamp(0.5rem,0.9vw,0.65rem)] mt-[clamp(0.2rem,0.5vw,0.4rem)] pt-[clamp(0.2rem,0.5vw,0.4rem)] border-t border-white/5"
      style={{ gridTemplateColumns: '3px minmax(0, 5rem) auto 1fr auto' }}
      title={t('modelDash.storeys.orphanTooltip')}
    >
      <span className="h-full w-[3px] rounded-sm bg-orange-500" aria-hidden />
      <span className="text-text-secondary truncate italic" title={t('modelDash.storeys.orphanLabel')}>
        {t('modelDash.storeys.orphanLabel')}
      </span>
      <span className="text-text-tertiary tabular-nums w-[3.5em] text-right">—</span>
      <div className="h-[clamp(0.7rem,1.2vw,1rem)] bg-white/5 rounded overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-orange-500/70 to-orange-500/40"
          style={{ width: `${(count / maxCount) * 100}%` }}
        />
      </div>
      <span className="text-orange-500 tabular-nums font-medium w-[3em] text-right">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

export default VerifiedStoreyChart;
