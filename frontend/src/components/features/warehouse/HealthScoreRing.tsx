import { cn } from '@/lib/utils';

interface HealthScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

/**
 * Circular health score indicator with color coding.
 * - Green (>= 80): healthy
 * - Yellow (>= 50): warning
 * - Red (< 50): critical
 */
export function HealthScoreRing({
  score,
  size = 'md',
  showLabel = true,
  label,
  className,
}: HealthScoreRingProps) {
  // Normalize score to 0-100
  const normalizedScore = Math.min(100, Math.max(0, score));

  // Calculate stroke properties
  const sizeConfig = {
    sm: { diameter: 60, strokeWidth: 6, fontSize: 'text-[clamp(0.75rem,2vw,1rem)]' },
    md: { diameter: 100, strokeWidth: 8, fontSize: 'text-[clamp(1.25rem,3vw,1.75rem)]' },
    lg: { diameter: 140, strokeWidth: 10, fontSize: 'text-[clamp(1.75rem,4vw,2.5rem)]' },
  };

  const { diameter, strokeWidth, fontSize } = sizeConfig[size];
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  // Color based on score thresholds
  const getColor = (s: number) => {
    if (s >= 80) return { stroke: '#22c55e', text: 'text-green-500', bg: 'bg-green-500/10' };
    if (s >= 50) return { stroke: '#eab308', text: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-500/10' };
  };

  const color = getColor(normalizedScore);

  return (
    <div className={cn('flex flex-col items-center gap-[clamp(0.25rem,1vw,0.5rem)]', className)}>
      <div className="relative" style={{ width: diameter, height: diameter }}>
        {/* Background circle */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={diameter}
          height={diameter}
        >
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted-foreground/20"
          />
        </svg>

        {/* Progress circle */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={diameter}
          height={diameter}
        >
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-bold', fontSize, color.text)}>
            {Math.round(normalizedScore)}%
          </span>
        </div>
      </div>

      {/* Label */}
      {showLabel && label && (
        <span className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-muted-foreground text-center">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Compact health status dot indicator.
 */
export function HealthStatusDot({
  score,
  size = 'md',
  className,
}: {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3';

  const getStatusColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <span
      className={cn('inline-block rounded-full', sizeClass, getStatusColor(score), className)}
      title={`Health: ${Math.round(score)}%`}
    />
  );
}
