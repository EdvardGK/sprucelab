import { useMemo } from 'react';

export interface SparkSegment {
  /** Stable key for the segment (e.g., IFC class name). */
  key: string;
  value: number;
  /** Tailwind class or CSS color for the fill. */
  color: string;
  /** Optional accessible label shown via <title>. */
  label?: string;
}

interface SparklineProps {
  /** Stacked-bar segments. The total = sum(values). */
  segments: SparkSegment[];
  /** Visual variant. */
  variant?: 'stacked' | 'progress';
  /** Only meaningful for variant=progress — value 0–100. */
  progressValue?: number;
  /** Progress color override (variant=progress). */
  progressColor?: string;
  /** Optional background track color. */
  trackColor?: string;
  /** Show a 1-line legend under the bar with top N labels. */
  legend?: number;
  className?: string;
}

/**
 * Lightweight horizontal sparkline. SVG-based, no deps. Two variants:
 * - "stacked" — proportional horizontal stacked bar showing per-segment
 *   share of total. Useful for distributions (IFC class, contributing
 *   classes, etc.).
 * - "progress" — single 0-100 progress strip. Useful for percentage KPIs.
 *
 * Both animate width changes via CSS transition for a count-up feel.
 */
export function Sparkline({
  segments,
  variant = 'stacked',
  progressValue,
  progressColor = 'hsl(158 70% 28%)',
  trackColor = 'hsl(var(--muted) / 0.5)',
  legend,
  className,
}: SparklineProps) {
  const total = useMemo(
    () => segments.reduce((s, seg) => s + Math.max(0, seg.value), 0),
    [segments]
  );

  if (variant === 'progress') {
    const pct = Math.max(0, Math.min(100, progressValue ?? 0));
    return (
      <div className={className}>
        <div
          className="h-[clamp(0.5rem,0.9vh,0.75rem)] w-full rounded-full overflow-hidden"
          style={{ background: trackColor }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%`, background: progressColor }}
          />
        </div>
      </div>
    );
  }

  // Stacked
  if (total === 0) {
    return (
      <div className={className}>
        <div
          className="h-[clamp(0.5rem,0.9vh,0.75rem)] w-full rounded-full"
          style={{ background: trackColor }}
        />
      </div>
    );
  }

  // Sort by value desc so the dominant segment renders first (left).
  const sorted = [...segments]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const legendSegs = legend ? sorted.slice(0, legend) : [];

  return (
    <div className={className}>
      <div
        className="h-[clamp(0.5rem,0.9vh,0.75rem)] w-full rounded-full overflow-hidden flex"
        style={{ background: trackColor }}
      >
        {sorted.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.key}
              title={`${seg.label ?? seg.key}: ${seg.value.toLocaleString()}`}
              className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%`, background: seg.color }}
            />
          );
        })}
      </div>
      {legendSegs.length > 0 && (
        <div className="mt-[clamp(0.125rem,0.3vh,0.375rem)] flex items-center gap-[clamp(0.375rem,0.6vw,0.75rem)] flex-wrap text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground">
          {legendSegs.map((seg) => (
            <span key={seg.key} className="inline-flex items-center gap-1 min-w-0">
              <span
                className="h-[clamp(0.375rem,0.6vw,0.5rem)] w-[clamp(0.375rem,0.6vw,0.5rem)] rounded-full shrink-0"
                style={{ background: seg.color }}
              />
              <span className="truncate">{seg.label ?? seg.key}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
