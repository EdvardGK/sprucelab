import * as React from 'react';

import { DashboardTile } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';

export type ModelKpiTone = 'neutral' | 'good' | 'warning' | 'danger';

const TONE_STYLES: Record<ModelKpiTone, { card: string; value: string; icon: string }> = {
  neutral: {
    card: '',
    value: '',
    icon: 'text-muted-foreground',
  },
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

interface ModelsKpiTileProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** Numeric value — animated with useCountUp. Ignored when `display` is set. */
  value?: number;
  /**
   * Pre-formatted string to display instead of the count-up. Used for the
   * "Latest upload" tile where the value is a moment, not a quantity, and
   * for the file-size tile where the unit changes the rendering.
   */
  display?: string;
  /** Suffix appended after the count-up (e.g. " s", " MB"). */
  suffix?: string;
  /** Tone ring + value color. Defaults to neutral. */
  tone?: ModelKpiTone;
  /** Sparkline / mini visual at the bottom of the tile. */
  spark?: React.ReactNode;
  /** Loading shimmer state. */
  loading?: boolean;
  /**
   * Render an amber em-dash for the value when true. Used for KPIs the
   * backend doesn't expose yet (modelers-own-data rule). Forces tone
   * to neutral with amber text on the em-dash.
   */
  unavailable?: boolean;
}

/**
 * Single project-level KPI tile — used in the IFC Models page header. Same
 * visual language as `<TypeKpiGrid>` tiles but lighter-weight (no
 * filtered-vs-total dual display, no fraction mode). Tabular numerals,
 * ~20% empty top, count-up on value, sparkline footer.
 */
export function ModelsKpiTile({
  id,
  icon,
  label,
  value,
  display,
  suffix,
  tone = 'neutral',
  spark,
  loading,
  unavailable,
}: ModelsKpiTileProps) {
  const toneStyles = TONE_STYLES[tone];
  const animated = useCountUp(value ?? 0);

  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-[clamp(0.5rem,1vw,0.875rem)] flex flex-col justify-between h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
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
        <div className="flex items-baseline gap-[clamp(0.125rem,0.3vw,0.25rem)]">
          <span
            className={cn(
              'text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums tracking-tight leading-none',
              toneStyles.value
            )}
          >
            {loading ? (
              <ShimmerBlock className="h-[clamp(1.5rem,3vw,2.5rem)] w-[clamp(2.5rem,5vw,4rem)]" />
            ) : unavailable ? (
              <span className="text-amber-500/80">—</span>
            ) : display !== undefined ? (
              display
            ) : (
              animated.toLocaleString()
            )}
          </span>
          {!loading && !unavailable && suffix && display === undefined && (
            <span className="text-[clamp(0.65rem,0.9vw,0.95rem)] text-muted-foreground tabular-nums leading-none">
              {suffix}
            </span>
          )}
        </div>
      </div>

      {spark && !loading && (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">{spark}</div>
      )}
    </DashboardTile>
  );
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]',
        className
      )}
    />
  );
}
