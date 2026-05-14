import * as React from 'react';
import { Info, type LucideIcon } from 'lucide-react';
import { DashboardTile } from '@/components/Layout/DashboardTile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkline } from '@/components/features/warehouse-v2/Sparkline';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import { cn } from '@/lib/utils';
import { TONE_STYLES, type Tone } from './helpers';
import type { DayCount, FailureKind, FailureRow } from './types';

/**
 * Reusable building blocks for every admin page. Lives under
 * `components/admin/` so each sub-route can compose the same KPI/section
 * grammar without duplicating tone logic or tooltip wiring.
 */

// ---------------------------------------------------------------------------
// InfoBadge — (i) icon + Radix tooltip explaining a metric in plain text.
// ---------------------------------------------------------------------------

export function InfoBadge({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-text-tertiary hover:text-text-primary transition-colors p-0.5"
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// DailyBars — 30-day SVG sparkline keyed to a list of {date, count}.
// Used for signups + uploads in their existing forms.
// ---------------------------------------------------------------------------

export function DailyBars({ data, color = 'var(--color-accent)' }: { data: DayCount[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 200;
  const h = 32;
  const barW = w / data.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.count / max) * h;
        return (
          <rect
            key={d.date}
            x={i * (barW + 1)}
            y={h - barH}
            width={barW}
            height={Math.max(barH, 0.5)}
            fill={color}
            opacity={0.7}
            rx={1}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KpiTile — DashboardTile-based metric with tone ring, animated count-up,
// optional progress sparkline, optional 30d bars, and an info tooltip.
// ---------------------------------------------------------------------------

export interface KpiTileProps {
  id: string;
  label: string;
  icon: LucideIcon;
  info: string;
  tone?: Tone;

  // Numeric path — animates via useCountUp.
  numericValue?: number;
  unit?: string;
  decimals?: number;

  // Pre-formatted string path (e.g. bytes, time).
  displayValue?: string;

  subline?: string;

  // Optional drill-in link rendered as a chevron in the header area.
  href?: string;

  // Pick at most one sparkline variant.
  progressFraction?: number; // 0–1
  bars?: DayCount[];
}

export function KpiTile({
  id,
  label,
  icon: Icon,
  info,
  tone = 'neutral',
  numericValue,
  unit,
  decimals,
  displayValue,
  subline,
  href,
  progressFraction,
  bars,
}: KpiTileProps) {
  const styles = TONE_STYLES[tone];
  const animated = useCountUp(numericValue ?? 0, {
    duration: 600,
    fraction: typeof decimals === 'number' && decimals > 0,
  });
  const rendered =
    displayValue !== undefined
      ? displayValue
      : typeof decimals === 'number'
        ? animated.toFixed(decimals)
        : animated.toLocaleString();

  const Wrapper: any = href ? 'a' : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper {...wrapperProps} className="block">
      <DashboardTile
        id={id}
        className={cn(
          'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between min-h-[clamp(5.5rem,11vh,7.5rem)] transition-all duration-200',
          href ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : '',
          styles.card,
        )}
      >
        <div className="flex items-center justify-between text-text-tertiary">
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
            {label}
          </span>
          <span className="inline-flex items-center gap-1 shrink-0">
            <Icon className={cn('h-[clamp(0.875rem,1.4vw,1rem)] w-[clamp(0.875rem,1.4vw,1rem)]', styles.icon)} />
            <InfoBadge text={info} />
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-[clamp(0.15rem,0.3vw,0.3rem)] flex-wrap">
            <span className={cn('text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums leading-tight', styles.value)}>
              {rendered}
            </span>
            {unit ? (
              <span className="text-[clamp(0.7rem,0.9vw,0.95rem)] text-text-tertiary">{unit}</span>
            ) : null}
          </div>
          {subline ? (
            <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.7rem)] text-text-tertiary truncate">
              {subline}
            </div>
          ) : null}
        </div>
        {progressFraction !== undefined ? (
          <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">
            <Sparkline
              segments={[]}
              variant="progress"
              progressValue={Math.max(0, Math.min(100, progressFraction * 100))}
              progressColor={styles.spark}
            />
          </div>
        ) : null}
        {bars ? (
          <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">
            <DailyBars data={bars} color={styles.spark} />
          </div>
        ) : null}
      </DashboardTile>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — every detail panel uses this so the title gets a free
// (i) tooltip and an optional leading icon.
// ---------------------------------------------------------------------------

export function SectionCard({
  title,
  info,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  info: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)] flex items-center gap-2">
          {Icon ? (
            <Icon className="h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] text-text-tertiary" />
          ) : null}
          <span>{title}</span>
          <InfoBadge text={info} />
          {actions ? <span className="ml-auto">{actions}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FailureItem — one row in the unified failures feed.
// ---------------------------------------------------------------------------

const KIND_DOT: Record<FailureKind, string> = {
  extraction: 'bg-red-500',
  pipeline: 'bg-orange-500',
  model_parsing: 'bg-amber-500',
  fragments: 'bg-pink-500',
};

export function FailureItem({
  f,
  kindLabel,
  relative,
}: {
  f: FailureRow;
  kindLabel: string;
  relative: string;
}) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 text-[clamp(0.625rem,1.2vw,0.75rem)]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className={cn('h-2 w-2 rounded-full shrink-0', KIND_DOT[f.kind])} />
          {kindLabel}
          {f.format ? <span className="font-mono uppercase ml-1 text-text-tertiary">{f.format}</span> : null}
        </span>
        <span className="text-text-secondary tabular-nums">{relative}</span>
      </div>
      <div className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 truncate">
        {f.filename || f.pipeline || ''}
      </div>
      <div className="text-red-700 text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 line-clamp-2">
        {f.error_message || '(no error message)'}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// SystemStat — small dt/dd pair for system probe rows.
// ---------------------------------------------------------------------------

export function SystemStat({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="flex flex-col">
      <dt className="text-text-tertiary text-[clamp(0.5rem,1vw,0.625rem)] uppercase tracking-wider">
        {label}
      </dt>
      <dd className={cn('font-medium tabular-nums flex items-center gap-1', styles.value)}>
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {value}
      </dd>
    </div>
  );
}
