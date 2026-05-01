/**
 * StoreyListClaimPanel — dedicated diff renderer for `claim_type === 'storey_list'`.
 *
 * Shows canonical floors (left) vs proposed floors from the claim (right) with a
 * per-row badge: match | alias-merge | rename | new | missing. Same severity
 * thresholds as the backend's `check_storey_deviation`, computed on the client
 * from the floors response (which carries `storey_merge_tolerance_m`). No
 * second source of truth — if the scope has no canonical floors yet, we render
 * the proposal as "all-new".
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useScopeFloors, type CanonicalFloor } from '@/hooks/use-scopes';
import type { Claim, StoreyListProposal } from '@/lib/claims-types';
import { cn } from '@/lib/utils';

type RowKind = 'match' | 'alias_merge' | 'rename' | 'new' | 'missing';

interface DiffRow {
  kind: RowKind;
  canonical?: CanonicalFloor;
  proposed?: StoreyListProposal;
}

const KIND_STYLES: Record<RowKind, string> = {
  match: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  alias_merge: 'bg-sky-50 text-sky-800 border-sky-200',
  rename: 'bg-amber-50 text-amber-800 border-amber-200',
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  missing: 'bg-rose-50 text-rose-800 border-rose-200',
};

function nameKeys(c: CanonicalFloor): Set<string> {
  const keys = new Set<string>();
  if (c.name) keys.add(c.name.trim().toLowerCase());
  for (const a of c.aliases ?? []) {
    if (a) keys.add(a.trim().toLowerCase());
  }
  return keys;
}

function diffFloors(
  canonical: CanonicalFloor[],
  proposed: StoreyListProposal[],
  toleranceM: number,
): DiffRow[] {
  const matched = new Set<number>();
  const rows: DiffRow[] = [];

  for (const p of proposed) {
    const pNameKey = (p.name || '').trim().toLowerCase();
    const pElev = p.elevation_m ?? null;

    // 1. exact name/alias match → match (or alias_merge if aliased).
    const nameIdx = canonical.findIndex((c) => nameKeys(c).has(pNameKey));
    if (nameIdx !== -1) {
      matched.add(nameIdx);
      const c = canonical[nameIdx];
      const isAlias = (c.name || '').trim().toLowerCase() !== pNameKey;
      rows.push({ kind: isAlias ? 'alias_merge' : 'match', canonical: c, proposed: p });
      continue;
    }

    // 2. elevation within tolerance, name differs → rename.
    if (pElev !== null) {
      const elevIdx = canonical.findIndex(
        (c) => c.elevation_m !== null && c.elevation_m !== undefined &&
          Math.abs((c.elevation_m as number) - pElev) <= toleranceM,
      );
      if (elevIdx !== -1 && !matched.has(elevIdx)) {
        matched.add(elevIdx);
        rows.push({ kind: 'rename', canonical: canonical[elevIdx], proposed: p });
        continue;
      }
    }

    // 3. no match → new.
    rows.push({ kind: 'new', proposed: p });
  }

  for (let i = 0; i < canonical.length; i++) {
    if (!matched.has(i)) {
      rows.push({ kind: 'missing', canonical: canonical[i] });
    }
  }

  return rows;
}

export function StoreyListClaimPanel({ claim }: { claim: Claim }) {
  const { t } = useTranslation();
  const proposed = (claim.normalized?.floors ?? []) as StoreyListProposal[];
  const { data, isLoading } = useScopeFloors(claim.scope, { enabled: !!claim.scope });

  const canonical = data?.canonical_floors ?? [];
  const tolerance = data?.storey_merge_tolerance_m ?? 0.2;

  const rows = useMemo(
    () => diffFloors(canonical, proposed, tolerance),
    [canonical, proposed, tolerance],
  );

  if (!claim.scope) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        {t('floors.diff.noScope')}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('floors.diff.title')}
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {t('floors.diff.tolerance')}: ±{tolerance.toFixed(2)} m
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('common.loading')}
        </div>
      ) : (
        <div className="rounded-md border bg-muted/20 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto] text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-1.5">
            <span>{t('floors.canonical')}</span>
            <span>{t('floors.proposed')}</span>
            <span className="text-right">{t('floors.diff.status')}</span>
          </div>
          {rows.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground italic text-center">
              {t('floors.diff.empty')}
            </div>
          )}
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_auto] items-center px-3 py-1.5 border-t text-sm"
            >
              <FloorCell
                primary={row.canonical?.name}
                secondary={row.canonical?.elevation_m}
                code={row.canonical?.code}
              />
              <FloorCell
                primary={row.proposed?.name}
                secondary={row.proposed?.elevation_m ?? null}
              />
              <span
                className={cn(
                  'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                  KIND_STYLES[row.kind],
                )}
              >
                {t(`floors.diff.kind.${row.kind}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FloorCell({
  primary,
  secondary,
  code,
}: {
  primary?: string | null;
  secondary?: number | null;
  code?: string;
}) {
  if (!primary) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-medium truncate">
        {primary}
        {code && code !== primary && (
          <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">{code}</span>
        )}
      </span>
      {secondary !== null && secondary !== undefined && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {secondary.toFixed(2)} m
        </span>
      )}
    </div>
  );
}
