import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDashboardMetrics } from '@/hooks/use-warehouse';
import { HealthScoreRing } from './HealthScoreRing';
import { ModelHealthGrid } from './ModelHealthCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Clock, Eye, Layers } from 'lucide-react';

interface TypeDashboardProps {
  projectId: string;
  onModelSelect?: (modelId: string) => void;
  className?: string;
}

/**
 * Type Dashboard - MVP Priority #1
 * Shows project/model health at a glance with health scores and progress tracking.
 */
export function TypeDashboard({
  projectId,
  onModelSelect,
  className,
}: TypeDashboardProps) {
  const { t } = useTranslation();
  const { data: metrics, isLoading, error } = useDashboardMetrics({ projectId });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        {t('dashboard.error', 'Failed to load dashboard metrics')}
      </div>
    );
  }

  const { project_summary, models } = metrics;

  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden',
        'p-[clamp(0.75rem,2vw,1.5rem)] gap-[clamp(0.75rem,2vw,1rem)]',
        className
      )}
    >
      {/* Header Row: Health Score + Summary Stats */}
      <div className="flex flex-wrap gap-[clamp(0.75rem,2vw,1rem)] shrink-0">
        {/* Health Score Ring */}
        <Card className="flex-shrink-0">
          <CardContent className="p-[clamp(0.75rem,2vw,1rem)] flex items-center justify-center">
            <HealthScoreRing
              score={project_summary.health_score}
              size="lg"
              label={t('dashboard.healthScore', 'Health Score')}
            />
          </CardContent>
        </Card>

        {/* Summary Stats Grid */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-[clamp(0.5rem,1.5vw,0.75rem)] min-w-[200px]">
          <StatCard
            icon={<CheckCircle2 className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]" />}
            value={project_summary.mapped}
            label={t('dashboard.mapped', 'Mapped')}
            color="green"
          />
          <StatCard
            icon={<Clock className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]" />}
            value={project_summary.pending}
            label={t('dashboard.pending', 'Pending')}
            color="yellow"
          />
          <StatCard
            icon={<Eye className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]" />}
            value={project_summary.review}
            label={t('dashboard.review', 'Review')}
            color="blue"
          />
          <StatCard
            icon={<Layers className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)]" />}
            value={project_summary.total_types}
            label={t('dashboard.totalTypes', 'Total Types')}
            color="neutral"
          />
        </div>
      </div>

      {/* Progress Breakdown */}
      <Card className="shrink-0">
        <CardHeader className="p-[clamp(0.5rem,1.5vw,0.75rem)] pb-0">
          <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
            {t('dashboard.progressByStatus', 'Progress by Status')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-[clamp(0.5rem,1.5vw,0.75rem)]">
          <ProgressBreakdown
            total={project_summary.total_types}
            mapped={project_summary.mapped}
            pending={project_summary.pending}
            review={project_summary.review}
            ignored={project_summary.ignored}
          />
        </CardContent>
      </Card>

      {/* Completeness Metrics */}
      <Card className="shrink-0">
        <CardHeader className="p-[clamp(0.5rem,1.5vw,0.75rem)] pb-0">
          <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
            {t('dashboard.completeness', 'Completeness')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-[clamp(0.5rem,1.5vw,0.75rem)]">
          <div className="grid grid-cols-3 gap-[clamp(0.5rem,1.5vw,0.75rem)]">
            <CompletenessBar
              label={t('dashboard.classification', 'Classification')}
              value={project_summary.classification_percent}
              helpText={t('dashboard.classificationHelp', 'Types with NS3451 code')}
            />
            <CompletenessBar
              label={t('dashboard.units', 'Units')}
              value={project_summary.unit_percent}
              helpText={t('dashboard.unitsHelp', 'Types with measurement unit')}
            />
            <CompletenessBar
              label={t('dashboard.materials', 'Materials')}
              value={project_summary.material_percent}
              helpText={t('dashboard.materialsHelp', 'Types with material layers')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Models Section */}
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CardHeader className="p-[clamp(0.5rem,1.5vw,0.75rem)] pb-0 shrink-0">
          <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
            {t('dashboard.models', 'Models')} ({models.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-[clamp(0.5rem,1.5vw,0.75rem)] flex-1 overflow-y-auto min-h-0">
          <ModelHealthGrid
            models={models}
            onModelClick={onModelSelect}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compact stat card for summary metrics.
 */
function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: 'green' | 'yellow' | 'blue' | 'red' | 'neutral';
}) {
  const colorClasses = {
    green: 'text-green-500 bg-green-500/10',
    yellow: 'text-yellow-500 bg-yellow-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    red: 'text-red-500 bg-red-500/10',
    neutral: 'text-muted-foreground bg-muted',
  };

  return (
    <Card>
      <CardContent className="p-[clamp(0.5rem,1.5vw,0.75rem)] flex flex-col items-center">
        <div className={cn('rounded-full p-1.5', colorClasses[color])}>
          {icon}
        </div>
        <span className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold mt-1">
          {value}
        </span>
        <span className="text-[clamp(0.5rem,1vw,0.625rem)] text-muted-foreground text-center">
          {label}
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * Stacked progress bar showing status breakdown.
 */
function ProgressBreakdown({
  total,
  mapped,
  pending,
  review,
  ignored,
}: {
  total: number;
  mapped: number;
  pending: number;
  review: number;
  ignored: number;
}) {
  const { t } = useTranslation();

  if (total === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm">
        {t('dashboard.noTypes', 'No types found')}
      </div>
    );
  }

  const segments = [
    { key: 'mapped', value: mapped, color: 'bg-green-500', label: t('dashboard.mapped', 'Mapped') },
    { key: 'review', value: review, color: 'bg-blue-500', label: t('dashboard.review', 'Review') },
    { key: 'pending', value: pending, color: 'bg-yellow-500', label: t('dashboard.pending', 'Pending') },
    { key: 'ignored', value: ignored, color: 'bg-muted-foreground/50', label: t('dashboard.ignored', 'Ignored') },
  ];

  const progressPercent = Math.round((mapped / total) * 100);

  return (
    <div className="space-y-[clamp(0.25rem,0.8vw,0.5rem)]">
      {/* Progress bar */}
      <div className="h-3 bg-muted rounded-full overflow-hidden flex">
        {segments.map((segment) => {
          const width = (segment.value / total) * 100;
          if (width === 0) return null;
          return (
            <div
              key={segment.key}
              className={cn('h-full transition-all', segment.color)}
              style={{ width: `${width}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-[clamp(0.75rem,2vw,1rem)] gap-y-[clamp(0.25rem,0.5vw,0.375rem)]">
        <span className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-medium">
          {progressPercent}% {t('dashboard.complete', 'complete')}
        </span>
        <div className="flex flex-wrap gap-x-[clamp(0.5rem,1.5vw,0.75rem)] gap-y-[clamp(0.125rem,0.3vw,0.25rem)]">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center gap-[clamp(0.125rem,0.4vw,0.25rem)]"
            >
              <span className={cn('w-2 h-2 rounded-sm', segment.color)} />
              <span className="text-[clamp(0.5rem,1vw,0.625rem)] text-muted-foreground">
                {segment.label} {segment.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bar showing completeness percentage.
 */
function CompletenessBar({
  label,
  value,
  helpText,
}: {
  label: string;
  value: number;
  helpText?: string;
}) {
  const normalizedValue = Math.min(100, Math.max(0, value));

  const getBarColor = (v: number) => {
    if (v >= 80) return 'bg-green-500';
    if (v >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-[clamp(0.125rem,0.4vw,0.25rem)]" title={helpText}>
      <div className="flex items-baseline justify-between">
        <span className="text-[clamp(0.5rem,1vw,0.625rem)] text-muted-foreground">
          {label}
        </span>
        <span className="text-[clamp(0.625rem,1.2vw,0.75rem)] font-medium">
          {Math.round(normalizedValue)}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', getBarColor(normalizedValue))}
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Loading skeleton for dashboard.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col h-full p-[clamp(0.75rem,2vw,1.5rem)] gap-[clamp(0.75rem,2vw,1rem)]">
      <div className="flex gap-[clamp(0.75rem,2vw,1rem)]">
        <Skeleton className="w-40 h-40 rounded-lg" />
        <div className="flex-1 grid grid-cols-4 gap-[clamp(0.5rem,1.5vw,0.75rem)]">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-16" />
      <Skeleton className="flex-1" />
    </div>
  );
}

export default TypeDashboard;
