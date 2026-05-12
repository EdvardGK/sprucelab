import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { familyColor } from './familyColors';
import type { MaterialSet } from '@/hooks/use-project-materials';

interface MaterialSetCardProps {
  set: MaterialSet;
  selected: boolean;
  onClick: () => void;
}

export function MaterialSetCard({ set, selected, onClick }: MaterialSetCardProps) {
  const { t } = useTranslation();
  const typeCount = new Set(set.used_in_types.map((u) => u.type_id)).size;

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-md border p-[clamp(0.5rem,1vw,0.875rem)] transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium text-[clamp(0.625rem,1vw,0.8125rem)] text-text-primary">
            {set.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
            <span>
              {set.layer_count} {t('materialBrowser.set.layers')}
            </span>
            {set.total_thickness_mm !== null && (
              <>
                <span>·</span>
                <span>{set.total_thickness_mm.toFixed(0)} mm</span>
              </>
            )}
            <span>·</span>
            <span>
              {typeCount} {t('materialBrowser.set.types')}
            </span>
          </div>
        </div>
        <Badge
          variant="secondary"
          className="text-[clamp(0.5rem,0.8vw,0.625rem)]"
        >
          {set.total_instance_count}
        </Badge>
      </div>
      {/* Compact stacked-bar layer preview — same vocabulary as the
          detail-panel Layers tab. */}
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-sm border border-border/40">
        {set.layers.slice(0, 12).map((l) => {
          const hasThickness =
            set.total_thickness_mm !== null && (l.thickness_mm ?? 0) > 0;
          const share = hasThickness
            ? ((l.thickness_mm ?? 0) / (set.total_thickness_mm ?? 1)) * 100
            : 100 / Math.max(1, set.layers.length);
          return (
            <div
              key={l.layer_order}
              style={{ width: `${share}%`, background: familyColor(l.family) }}
              title={l.material_name}
            />
          );
        })}
      </div>
    </div>
  );
}
