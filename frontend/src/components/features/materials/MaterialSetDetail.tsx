import { useTranslation } from 'react-i18next';

import { familyColor } from './familyColors';
import type { MaterialSet } from '@/hooks/use-project-materials';

interface MaterialSetDetailProps {
  set: MaterialSet;
}

export function MaterialSetDetail({ set }: MaterialSetDetailProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-[clamp(0.625rem,1.2vw,1rem)] p-[clamp(0.75rem,1.5vw,1rem)]">
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.set')}
        </div>
        <div className="mt-0.5 text-[clamp(0.875rem,1.6vw,1.0625rem)] font-semibold text-text-primary">
          {set.name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
          <span>
            {set.layer_count} {t('materialBrowser.set.layers')}
          </span>
          {set.total_thickness_mm !== null && (
            <>
              <span>·</span>
              <span>{set.total_thickness_mm.toFixed(0)} mm</span>
            </>
          )}
        </div>
      </div>

      {/* Compact stacked-bar — full width, then a per-layer legend.
          Mirrors the TypeDataRail layer pattern. */}
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.composition')}
        </div>
        <div className="mt-1.5 flex h-[clamp(1.25rem,2vh,1.75rem)] w-full overflow-hidden rounded border border-border/60">
          {set.layers.map((l) => {
            const hasThickness =
              set.total_thickness_mm !== null && (l.thickness_mm ?? 0) > 0;
            const share = hasThickness
              ? ((l.thickness_mm ?? 0) / (set.total_thickness_mm ?? 1)) * 100
              : 100 / Math.max(1, set.layers.length);
            return (
              <div
                key={l.layer_order}
                style={{
                  width: `${Math.max(share, 1.5)}%`,
                  background: familyColor(l.family),
                }}
                title={`${l.material_name}${
                  l.thickness_mm !== null ? ` · ${l.thickness_mm} mm` : ''
                }`}
              />
            );
          })}
        </div>
        <ul className="mt-2 flex flex-col gap-0.5 text-[clamp(0.55rem,0.8vw,0.75rem)] text-muted-foreground">
          {set.layers.map((l) => (
            <li
              key={l.layer_order}
              className="flex items-center gap-1.5 truncate"
            >
              <span
                className="h-[clamp(0.45rem,0.55vw,0.6rem)] w-[clamp(0.45rem,0.55vw,0.6rem)] rounded-sm shrink-0"
                style={{ background: familyColor(l.family) }}
              />
              <span className="tabular-nums shrink-0 text-text-tertiary">
                {l.layer_order}
              </span>
              <span className="truncate text-text-primary">{l.material_name}</span>
              {l.thickness_mm !== null && l.thickness_mm > 0 ? (
                <span className="tabular-nums shrink-0">
                  {l.thickness_mm.toFixed(0)} mm
                </span>
              ) : (
                <span
                  className="tabular-nums shrink-0 text-amber-600 dark:text-amber-400"
                  title={t('materialBrowser.missingValue')}
                >
                  —
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Used in types */}
      <div>
        <div className="text-[clamp(0.5rem,0.9vw,0.6875rem)] uppercase tracking-wide text-text-tertiary">
          {t('materialBrowser.detail.usedIn')}
        </div>
        <div className="mt-1 space-y-1">
          {set.used_in_types.slice(0, 12).map((u) => (
            <div
              key={u.type_id}
              className="flex items-center justify-between rounded border bg-background p-[clamp(0.375rem,0.7vw,0.6rem)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[clamp(0.625rem,1.1vw,0.8125rem)] font-medium text-text-primary">
                  {u.type_name ?? u.ifc_type}
                </div>
                <div className="truncate text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary">
                  {u.ifc_type}
                </div>
              </div>
              <span className="text-[clamp(0.5rem,0.9vw,0.6875rem)] text-text-tertiary tabular-nums">
                {u.instance_count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
