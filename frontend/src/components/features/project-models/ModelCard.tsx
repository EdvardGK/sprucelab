import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Box as BoxIcon,
  Layers3,
  Loader2,
  MoreVertical,
  Palette,
  RefreshCw,
  Trash2,
  Type as TypeIcon,
} from 'lucide-react';

import { ModelStatusBadge } from '@/components/ModelStatusBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import { cn } from '@/lib/utils';
import type { Model } from '@/lib/api-types';

interface ModelCardProps {
  projectId: string;
  model: Model;
  onDelete: (id: string, name: string) => void;
  onReprocess: (id: string) => void;
  reprocessing: boolean;
  /**
   * 'big' = banner + content. 'small' = banner hidden, compact card.
   * Default 'big' so existing call sites keep their look.
   */
  density?: 'big' | 'small';
}

/**
 * Tactical model card — top-banner thumbnail + full-width content below.
 *
 * Layout principle (after iteration): the data column gets the FULL card
 * width — narrow side columns squeezed the name + KPIs. The thumbnail
 * earns a horizontal strip at the top instead (~80-100px), so the image
 * is visible but doesn't fight the data for horizontal real estate.
 *
 * When `Model.thumbnail_url` is null (older models, before the backend
 * snapshot pipeline ran on them), the banner stays at the same height
 * but shows a quiet placeholder — uniform card sizing keeps the grid
 * tidy. Hover over the banner reveals an "Open in 3D" affordance.
 *
 * Click anywhere on the card navigates to the model workspace; the
 * kebab menu stops propagation. Modelers-own-data: missing values
 * render as amber em-dash.
 */
function ModelCardImpl({
  projectId,
  model,
  onDelete,
  onReprocess,
  reprocessing,
  density = 'big',
}: ModelCardProps) {
  const { t } = useTranslation();

  const isReady = model.status === 'ready';
  const isError = model.status === 'error';
  const showBanner = density === 'big';

  const relUpdated = useRelativeTime(model.updated_at || model.created_at);

  return (
    <Link
      to={`/projects/${projectId}/models/${model.id}`}
      className="block group focus:outline-none"
    >
      <div
        className={cn(
          'relative flex flex-col bg-card border border-border rounded-md overflow-hidden',
          showBanner ? 'h-[clamp(220px,26vh,260px)]' : 'h-[clamp(140px,18vh,170px)]',
          'transition-all duration-200',
          'hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md',
          'focus-within:ring-2 focus-within:ring-primary/40'
        )}
      >
        {/* Banner — top strip with the snapshot. Full card width so the
            image doesn't compete with the data column for horizontal
            real estate. Hover reveals the Open-in-3D affordance. */}
        {showBanner && (
        <div className="relative shrink-0 h-[clamp(82px,10vh,108px)] overflow-hidden border-b border-border bg-muted/30">
          {isReady && model.thumbnail_url ? (
            <img
              src={model.thumbnail_url}
              alt={model.name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/50">
              <BoxIcon className="h-6 w-6" />
            </div>
          )}
          {isReady && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-background/55 backdrop-blur-[2px]',
                'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                'pointer-events-none'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  'rounded-full border border-border bg-card px-2.5 py-1',
                  'text-[0.65rem] font-medium text-foreground shadow-sm'
                )}
              >
                <BoxIcon className="h-3 w-3" />
                {t('projectModels.card.openIn3d')}
              </span>
            </div>
          )}
        </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 p-[clamp(0.625rem,1vw,0.875rem)] gap-[clamp(0.25rem,0.5vh,0.5rem)] min-w-0">
          {/* Header — name + version + status + updated */}
          <div className="flex items-start justify-between gap-[clamp(0.375rem,0.6vw,0.625rem)] min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-[clamp(0.25rem,0.5vw,0.5rem)] min-w-0">
                <span className="font-medium text-[clamp(0.75rem,1vw,0.9rem)] text-text-primary truncate">
                  {model.name}
                </span>
                <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground tabular-nums shrink-0">
                  v{model.version_number}
                </span>
              </div>
              <span className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground">
                {t('projectModels.card.updatedRelative', { relative: relUpdated })}
              </span>
            </div>
            <div className="flex items-center gap-[clamp(0.125rem,0.25vw,0.25rem)] shrink-0">
              <ModelStatusBadge status={model.status} />
              <CardMenu
                onReprocess={() => onReprocess(model.id)}
                onDelete={() => onDelete(model.id, model.name)}
                reprocessing={reprocessing}
                status={model.status}
              />
            </div>
          </div>

          {/* KPI strip — the data IS the card. */}
          <CardKpiStrip
            elements={isReady ? model.element_count : null}
            storeys={isReady ? model.storey_count : null}
            types={isReady ? model.type_count : null}
            materials={isReady ? model.material_count : null}
          />

          {/* Status messaging slot — only when there's something to say. */}
          {(isError || !isReady) && (
            <div className="mt-auto min-h-0">
              {isError ? (
                <ErrorMessage error={model.processing_error} />
              ) : (
                <ProcessingHint status={model.status} />
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export const ModelCard = memo(ModelCardImpl);

// --- subcomponents ---

function CardKpiStrip({
  elements,
  storeys,
  types,
  materials,
}: {
  elements: number | null;
  storeys: number | null;
  types: number | null;
  materials: number | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-[clamp(0.25rem,0.5vw,0.5rem)]">
      <CardKpi
        srLabel={t('projectModels.card.kpi.elements')}
        value={elements}
        icon={<BoxIcon className="h-3 w-3" />}
      />
      <CardKpi
        srLabel={t('projectModels.card.kpi.storeys')}
        value={storeys}
        icon={<Layers3 className="h-3 w-3" />}
      />
      <CardKpi
        srLabel={t('projectModels.card.kpi.types')}
        value={types}
        icon={<TypeIcon className="h-3 w-3" />}
      />
      <CardKpi
        srLabel={t('projectModels.card.kpi.materials')}
        value={materials}
        icon={<Palette className="h-3 w-3" />}
      />
    </div>
  );
}

function CardKpi({
  srLabel,
  value,
  icon,
}: {
  srLabel: string;
  value: number | null;
  icon: React.ReactNode;
}) {
  const animated = useCountUp(value ?? 0);
  const isMissing = value === null || value === 0;
  return (
    <div className="flex flex-col items-start min-w-0">
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="sr-only">{srLabel}</span>
      <span
        className={cn(
          'text-[clamp(0.75rem,1.2vw,1rem)] font-semibold tabular-nums leading-tight',
          isMissing ? 'text-amber-500/80' : 'text-text-primary'
        )}
      >
        {value === null ? '—' : value === 0 ? '—' : animated.toLocaleString()}
      </span>
    </div>
  );
}

function ErrorMessage({ error }: { error: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md bg-error/10 border border-error/20 p-[clamp(0.375rem,0.7vw,0.625rem)]">
      <div className="flex items-start gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 text-error mt-0.5 shrink-0" />
        <p className="text-[clamp(0.55rem,0.7vw,0.7rem)] text-error line-clamp-2">
          {error || t('modelStatus.processingFailed')}
        </p>
      </div>
    </div>
  );
}

function ProcessingHint({ status }: { status: Model['status'] }) {
  const { t } = useTranslation();
  const key =
    status === 'uploading'
      ? 'projectModels.card.processingUploading'
      : status === 'processing'
      ? 'projectModels.card.processingProcessing'
      : 'projectModels.card.processingPending';
  return (
    <div className="flex items-center gap-1.5 text-[clamp(0.55rem,0.7vw,0.7rem)] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{t(key)}</span>
    </div>
  );
}

function CardMenu({
  onReprocess,
  onDelete,
  reprocessing,
  status,
}: {
  onReprocess: () => void;
  onDelete: () => void;
  reprocessing: boolean;
  status: Model['status'];
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReprocess();
          }}
          disabled={reprocessing || status === 'processing'}
        >
          <RefreshCw
            className={cn('h-4 w-4 mr-2', reprocessing && 'animate-spin')}
          />
          {t('projectModels.card.menu.reprocess')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="text-error focus:text-error focus:bg-error/10"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('projectModels.card.menu.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- helpers ---

function useRelativeTime(iso: string | null | undefined): string {
  const { t } = useTranslation();
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t('projectModels.relative.justNow');
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t('projectModels.relative.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('projectModels.relative.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t('projectModels.relative.daysAgo', { count: diffDay });
  const diffMo = Math.round(diffDay / 30);
  return t('projectModels.relative.monthsAgo', { count: diffMo });
}
