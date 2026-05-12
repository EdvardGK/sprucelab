import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import { Sparkline, type SparkSegment } from '@/components/features/warehouse-v2/Sparkline';
import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';

export type KpiTone = 'neutral' | 'good' | 'warning' | 'danger';

const TONE_STYLES: Record<KpiTone, { card: string; value: string; icon: string }> = {
  neutral: { card: '', value: '', icon: 'text-muted-foreground' },
  good: {
    card: 'ring-1 ring-[hsl(158_70%_28%/0.25)]',
    value: 'text-[hsl(158_70%_28%)]',
    icon: 'text-[hsl(158_70%_28%)]',
  },
  warning: {
    card: 'ring-1 ring-amber-400/40',
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
  },
  danger: {
    card: 'ring-1 ring-red-400/50',
    value: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
  },
};

interface ProjectKpiTileProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** Primary numeric value (animated with count-up). */
  value: number;
  /** Optional faded "/ total" beside value (no animation). */
  totalValue?: number;
  /** Optional small subline under the value (e.g. "65% mapped"). */
  subValue?: string;
  /** Optional one-line caption with em-dash for missing data. */
  caption?: string;
  /** Render value as fixed decimal instead of integer. */
  fraction?: boolean;
  loading?: boolean;
  tone?: KpiTone;
  onClick?: () => void;
  /** Stacked sparkline segments. */
  sparkSegments?: SparkSegment[];
  /** Progress-style sparkline value 0-100 (mutually exclusive with sparkSegments). */
  progressValue?: number;
  progressColor?: string;
}

export function ProjectKpiTile({
  id,
  icon,
  label,
  value,
  totalValue,
  subValue,
  caption,
  fraction,
  loading,
  tone = 'neutral',
  onClick,
  sparkSegments,
  progressValue,
  progressColor,
}: ProjectKpiTileProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value, { fraction });
  const showTotal =
    totalValue !== undefined &&
    Math.abs(totalValue - value) > (fraction ? 0.05 : 0);
  const totalDisplay =
    totalValue !== undefined
      ? fraction
        ? totalValue.toFixed(1)
        : totalValue.toLocaleString()
      : null;

  const interactive = !!onClick;

  return (
    <DashboardTile
      id={id}
      onClick={onClick}
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between h-full transition-all duration-200',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        toneStyles.card
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
          {label}
        </span>
        <span className={cn(toneStyles.icon, 'shrink-0')}>{icon}</span>
      </div>
      <div>
        <div className="flex items-baseline gap-[clamp(0.25rem,0.5vw,0.5rem)] flex-wrap">
          <span
            className={cn(
              'text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none',
              toneStyles.value
            )}
          >
            {loading ? (
              <span className="inline-block h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(2.5rem,5vw,4rem)] rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" />
            ) : fraction ? (
              animated.toFixed(1)
            ) : (
              animated.toLocaleString()
            )}
          </span>
          {showTotal && !loading && (
            <span className="text-[clamp(0.65rem,0.9vw,0.95rem)] text-muted-foreground/70 tabular-nums leading-none">
              / {totalDisplay}
            </span>
          )}
        </div>
        {subValue && !loading && (
          <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums">
            {subValue}
          </div>
        )}
        {!subValue && caption && !loading && (
          <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] text-amber-600 dark:text-amber-400/80 tabular-nums">
            {caption}
          </div>
        )}
      </div>
      {!loading && (sparkSegments || progressValue !== undefined) && (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">
          {sparkSegments ? (
            <Sparkline segments={sparkSegments} variant="stacked" />
          ) : (
            <Sparkline
              segments={[]}
              variant="progress"
              progressValue={progressValue}
              progressColor={progressColor}
            />
          )}
        </div>
      )}
    </DashboardTile>
  );
}
