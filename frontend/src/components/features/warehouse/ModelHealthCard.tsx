import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { HealthStatusDot } from './HealthScoreRing';
import type { ModelHealthMetrics } from '@/hooks/use-warehouse';

interface ModelHealthCardProps {
  model: ModelHealthMetrics;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
}

/**
 * Compact card showing per-model health status.
 * Clicking navigates to that model's type list.
 */
export function ModelHealthCard({
  model,
  onClick,
  isActive,
  className,
}: ModelHealthCardProps) {
  const { t } = useTranslation();

  // Extract discipline from model name or use provided discipline
  const discipline = model.discipline || extractDiscipline(model.name);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col p-[clamp(0.5rem,1.5vw,0.75rem)] rounded-lg border transition-all',
        'hover:border-primary/50 hover:bg-accent/50',
        'text-left w-full min-w-0',
        isActive && 'border-primary bg-accent',
        className
      )}
    >
      {/* Header: Name + Status Dot */}
      <div className="flex items-center gap-[clamp(0.25rem,0.8vw,0.5rem)] min-w-0">
        <HealthStatusDot score={model.health_score} size="sm" />
        <span
          className="font-medium text-[clamp(0.625rem,1.2vw,0.75rem)] truncate flex-1"
          title={model.name}
        >
          {model.name}
        </span>
        {discipline && (
          <span className="text-[clamp(0.5rem,1vw,0.625rem)] px-1.5 py-0.5 bg-muted rounded text-muted-foreground shrink-0">
            {discipline}
          </span>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-baseline gap-[clamp(0.25rem,0.8vw,0.5rem)] mt-[clamp(0.25rem,0.8vw,0.375rem)]">
        <span className="text-[clamp(1rem,2.5vw,1.25rem)] font-bold">
          {Math.round(model.health_score)}%
        </span>
        <span className="text-[clamp(0.5rem,1vw,0.625rem)] text-muted-foreground">
          {model.mapped}/{model.total_types} {t('dashboard.mapped', 'mapped')}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-muted rounded-full mt-[clamp(0.25rem,0.8vw,0.375rem)] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            model.status === 'healthy' && 'bg-green-500',
            model.status === 'warning' && 'bg-yellow-500',
            model.status === 'critical' && 'bg-red-500'
          )}
          style={{ width: `${(model.mapped / model.total_types) * 100}%` }}
        />
      </div>
    </button>
  );
}

/**
 * Grid of model health cards.
 */
export function ModelHealthGrid({
  models,
  onModelClick,
  activeModelId,
  className,
}: {
  models: ModelHealthMetrics[];
  onModelClick?: (modelId: string) => void;
  activeModelId?: string;
  className?: string;
}) {
  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No models found
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-[clamp(0.5rem,1.5vw,0.75rem)]',
        // Responsive grid: 1 col on small, 2 on medium, 3 on large
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {models.map((model) => (
        <ModelHealthCard
          key={model.id}
          model={model}
          onClick={() => onModelClick?.(model.id)}
          isActive={model.id === activeModelId}
        />
      ))}
    </div>
  );
}

/**
 * Extract discipline code from model filename.
 * Examples: "ARK_Model.ifc" -> "ARK", "RIB-Structure.ifc" -> "RIB"
 */
function extractDiscipline(name: string): string | null {
  const patterns = [
    /^(ARK|RIB|RIV|RIE|RIG|RIVA|LARK|TEK|BYG)[_\-\s]/i,
    /_?(ARK|RIB|RIV|RIE|RIG|RIVA|LARK|TEK|BYG)[_\-\s.]/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}
