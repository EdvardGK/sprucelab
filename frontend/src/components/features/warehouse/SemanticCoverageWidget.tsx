import { useTranslation } from 'react-i18next';
import { Sparkles, CheckCircle2, AlertCircle, Bot, User, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useSemanticSummary, useAutoNormalizeTypeBank } from '@/hooks/use-warehouse';
import { cn } from '@/lib/utils';

interface SemanticCoverageWidgetProps {
  className?: string;
  compact?: boolean;
}

export function SemanticCoverageWidget({ className, compact = false }: SemanticCoverageWidgetProps) {
  const { t } = useTranslation();
  const { data: summary, isLoading, error } = useSemanticSummary();
  const autoNormalize = useAutoNormalizeTypeBank();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <span className="text-sm text-muted-foreground">{t('dashboard.error')}</span>
        </CardContent>
      </Card>
    );
  }

  const handleAutoNormalize = async () => {
    try {
      await autoNormalize.mutateAsync({});
    } catch {
      // Error handling
    }
  };

  // Source breakdown data
  const sourceData = [
    {
      key: 'auto_ifc_class',
      label: t('semanticTypes.sources.auto_ifc_class'),
      count: summary.by_source['auto_ifc_class'] || 0,
      icon: Bot,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      key: 'auto_name_pattern',
      label: t('semanticTypes.sources.auto_name_pattern'),
      count: summary.by_source['auto_name_pattern'] || 0,
      icon: Sparkles,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      key: 'manual',
      label: t('semanticTypes.sources.manual'),
      count: summary.by_source['manual'] || 0,
      icon: User,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      key: 'verified',
      label: t('semanticTypes.sources.verified'),
      count: summary.by_source['verified'] || 0,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
  ];

  // Compact view for dashboard cards
  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {t('semanticTypes.coverage.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Coverage percentage */}
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{summary.coverage_percent}%</span>
            <span className="text-sm text-muted-foreground">
              {summary.with_semantic_type} / {summary.total}
            </span>
          </div>

          {/* Progress bar */}
          <Progress value={summary.coverage_percent} className="h-2" />

          {/* Source icons */}
          <div className="flex items-center gap-2 justify-end">
            {sourceData.map(
              (source) =>
                source.count > 0 && (
                  <div
                    key={source.key}
                    className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-xs', source.bgColor)}
                  >
                    <source.icon className={cn('h-3 w-3', source.color)} />
                    <span className={source.color}>{source.count}</span>
                  </div>
                )
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full view
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {t('semanticTypes.coverage.title')}
            </CardTitle>
            <CardDescription>{t('semanticTypes.description')}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoNormalize}
            disabled={autoNormalize.isPending}
          >
            {autoNormalize.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('semanticTypes.actions.normalizing')}
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                {t('semanticTypes.actions.autoNormalize')}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main coverage stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label={t('semanticTypes.coverage.total')}
            value={summary.total}
            className="border-l-4 border-l-gray-400"
          />
          <StatCard
            label={t('semanticTypes.coverage.withType')}
            value={summary.with_semantic_type}
            className="border-l-4 border-l-green-500"
          />
          <StatCard
            label={t('semanticTypes.coverage.withoutType')}
            value={summary.without_semantic_type}
            className="border-l-4 border-l-amber-500"
          />
        </div>

        {/* Coverage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('semanticTypes.coverage.coveragePercent')}</span>
            <span className="font-medium">{summary.coverage_percent}%</span>
          </div>
          <Progress value={summary.coverage_percent} className="h-3" />
        </div>

        {/* Source breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t('semanticTypes.coverage.bySource')}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {sourceData.map((source) => (
              <div
                key={source.key}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md',
                  source.bgColor
                )}
              >
                <source.icon className={cn('h-4 w-4', source.color)} />
                <span className="text-sm flex-1">{source.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {source.count}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Top semantic types */}
        {Object.keys(summary.by_semantic_type).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('semanticTypes.coverage.byType')}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(summary.by_semantic_type)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([code, count]) => (
                  <Badge key={code} variant="outline" className="text-xs">
                    {code}: {count}
                  </Badge>
                ))}
              {Object.keys(summary.by_semantic_type).length > 10 && (
                <Badge variant="secondary" className="text-xs">
                  +{Object.keys(summary.by_semantic_type).length - 10}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Auto-normalize result */}
        {autoNormalize.isSuccess && autoNormalize.data && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {t('semanticTypes.actions.normalized', { count: autoNormalize.data.normalized })}
              {autoNormalize.data.skipped > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({t('semanticTypes.actions.skipped', { count: autoNormalize.data.skipped })})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Warning for low coverage */}
        {summary.coverage_percent < 50 && summary.without_semantic_type > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>
              {summary.without_semantic_type} types need semantic type assignment.
              Click &quot;Auto-Normalize All&quot; to classify automatically.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={cn('p-3 rounded-md bg-muted/50', className)}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default SemanticCoverageWidget;
