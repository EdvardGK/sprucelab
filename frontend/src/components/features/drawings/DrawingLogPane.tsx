import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useObservations,
  type Observation,
  type ObservationCategory,
} from '@/hooks/use-observations';
import { cn } from '@/lib/utils';

const CATEGORY_ORDER: ObservationCategory[] = [
  'title_block_field',
  'sheet_metadata',
  'file_metadata',
  'layer',
  'text_block',
  'annotation',
  'extraction_event',
  'other',
];

export default function DrawingLogPane({ sheetId }: { sheetId: string }) {
  const { t } = useTranslation();
  const [activeCategories, setActiveCategories] = useState<ObservationCategory[] | null>(null);
  const [search, setSearch] = useState('');

  const filters = useMemo(
    () => ({
      sheet: sheetId,
      ...(activeCategories && activeCategories.length > 0
        ? { category: activeCategories }
        : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [sheetId, activeCategories, search],
  );

  const { data: rows, isLoading } = useObservations(filters, !!sheetId);

  const counts = useMemo(() => {
    const map = new Map<ObservationCategory, number>();
    (rows ?? []).forEach((o) => {
      map.set(o.category, (map.get(o.category) ?? 0) + 1);
    });
    return map;
  }, [rows]);

  const grouped = useMemo(() => {
    const groups = new Map<ObservationCategory, Observation[]>();
    (rows ?? []).forEach((o) => {
      const list = groups.get(o.category) ?? [];
      list.push(o);
      groups.set(o.category, list);
    });
    return CATEGORY_ORDER
      .filter((cat) => groups.has(cat))
      .map((cat) => [cat, groups.get(cat) ?? []] as const);
  }, [rows]);

  const toggleCategory = (cat: ObservationCategory) => {
    setActiveCategories((current) => {
      const set = new Set(current ?? []);
      if (set.has(cat)) set.delete(cat);
      else set.add(cat);
      const next = Array.from(set);
      return next.length === 0 ? null : next;
    });
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="flex flex-none flex-col gap-[clamp(0.5rem,1vw,0.75rem)] border-b border-border px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.5rem,1vw,0.75rem)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('drawings.log.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-[clamp(0.25rem,0.5vw,0.5rem)]">
          {CATEGORY_ORDER.map((cat) => {
            const isActive = activeCategories?.includes(cat) ?? false;
            const count = counts.get(cat) ?? 0;
            return (
              <Button
                key={cat}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleCategory(cat)}
                className={cn(
                  'h-7 px-2.5 text-[clamp(0.625rem,1vw,0.75rem)] font-medium',
                  count === 0 && 'opacity-60',
                )}
              >
                {t(`drawings.log.category.${cat}`)}
                {count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded bg-background/40 px-1 text-[10px] tabular-nums">
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.75rem,1.5vw,1rem)]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-text-tertiary text-[clamp(0.75rem,1.2vw,0.875rem)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-text-tertiary text-[clamp(0.75rem,1.2vw,0.875rem)]">
            {t('drawings.log.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-[clamp(1rem,2vw,1.5rem)] list-none p-0">
            {grouped.map(([cat, items]) => (
              <li key={cat} className="list-none">
                <h3 className="text-[clamp(0.625rem,1vw,0.75rem)] font-semibold uppercase tracking-wider text-text-tertiary mb-[clamp(0.25rem,0.5vw,0.5rem)]">
                  {t(`drawings.log.category.${cat}`)} ({items.length})
                </h3>
                <ul className="divide-y divide-border rounded-md border border-border bg-surface list-none p-0">
                  {items.map((obs) => (
                    <ObservationRow key={obs.id} obs={obs} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ObservationRow({ obs }: { obs: Observation }) {
  const hasBbox =
    obs.bbox && typeof obs.bbox.x_mm === 'number' && typeof obs.bbox.y_mm === 'number';

  return (
    <li className="list-none px-[clamp(0.75rem,1.5vw,1rem)] py-[clamp(0.5rem,1vw,0.75rem)]">
      <div className="flex items-baseline gap-2">
        {obs.key && (
          <span className="font-mono text-[clamp(0.625rem,1vw,0.75rem)] font-semibold text-text-primary">
            {obs.key}
          </span>
        )}
        {obs.content && (
          <span className="text-[clamp(0.75rem,1.2vw,0.875rem)] text-text-secondary break-words">
            {obs.content}
          </span>
        )}
      </div>
      {hasBbox && (
        <p className="mt-0.5 text-[10px] text-text-tertiary tabular-nums">
          @ {Math.round(obs.bbox.x_mm ?? 0)},{Math.round(obs.bbox.y_mm ?? 0)} mm ·{' '}
          {Math.round(obs.bbox.w_mm ?? 0)}×{Math.round(obs.bbox.h_mm ?? 0)}
        </p>
      )}
    </li>
  );
}
