import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EIR_RULES,
  EIR_GROUP_LABELS,
  EIR_GROUP_ORDER,
  EIR_TIER_LABELS,
  EIR_TIER_ORDER,
  ruleMaxInstances,
  type EirRuleDefinition,
  type EirRuleKind,
  type EirRuleTier,
} from './eirRules';

interface EirRulePaletteProps {
  /** kind → how many instances currently in the workspace. */
  kindCounts: Map<EirRuleKind, number>;
  onAdd: (kind: EirRuleKind) => void;
  /** Active ISO 19650 tier filter. */
  tier: EirRuleTier;
  onTierChange: (tier: EirRuleTier) => void;
}

/**
 * Sidebar palette of every EIR rule kind. Two ways to add:
 *  - **Double-click** a row.
 *  - **Drag** a row onto the workspace.
 * Single click does nothing intentionally — avoids accidental adds.
 *
 * Rules at their `maxInstances` cap are visually disabled and not
 * draggable. Same-kind dupes are blocked at this layer.
 *
 * A top SegmentedControl filters by ISO 19650 tier (OIR/AIR/PIR/EIR).
 * Default tab is EIR — the everyday delivery contract.
 */
export function EirRulePalette({
  kindCounts,
  onAdd,
  tier,
  onTierChange,
}: EirRulePaletteProps) {
  const { t } = useTranslation();

  // Tier-filtered rule set + counts per tier (for the badge on each tab).
  const tierCounts = useMemo(() => {
    const m = new Map<EirRuleTier, number>();
    for (const r of EIR_RULES) m.set(r.tier, (m.get(r.tier) ?? 0) + 1);
    return m;
  }, []);

  const visibleRules = useMemo(
    () => EIR_RULES.filter((r) => r.tier === tier),
    [tier]
  );

  return (
    <nav className="flex flex-col gap-[clamp(0.625rem,1vh,1rem)]">
      <header className="px-[clamp(0.25rem,0.4vw,0.5rem)]">
        <h2 className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-semibold tracking-tight">
          {t('eirBuilder.palette.title', { defaultValue: 'Rule palette' })}
        </h2>
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.45] mt-0.5">
          {t('eirBuilder.palette.hint', {
            defaultValue: 'Double-click or drag a row into the workspace.',
          })}
        </p>
      </header>

      <TierTabs
        active={tier}
        counts={tierCounts}
        onChange={onTierChange}
      />

      {visibleRules.length === 0 ? (
        <p className="px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.625rem,1vh,1rem)] text-[clamp(0.6rem,0.72vw,0.78rem)] text-muted-foreground italic leading-[1.5]">
          {t('eirBuilder.palette.tierEmpty', {
            defaultValue: 'No requirements in this tier yet',
          })}
        </p>
      ) : (
        EIR_GROUP_ORDER.map((group) => {
          const rules = visibleRules.filter((r) => r.group === group);
          if (rules.length === 0) return null;
          return (
            <div key={group} className="flex flex-col">
              <div className="px-[clamp(0.375rem,0.6vw,0.75rem)] py-[clamp(0.125rem,0.3vh,0.375rem)] text-[clamp(0.5rem,0.65vw,0.7rem)] uppercase tracking-wide font-semibold text-muted-foreground/80">
                {EIR_GROUP_LABELS[group]}
              </div>
              <ul className="flex flex-col gap-0.5">
                {rules.map((rule) => (
                  <li key={rule.kind}>
                    <PaletteRow
                      rule={rule}
                      count={kindCounts.get(rule.kind) ?? 0}
                      onAdd={onAdd}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </nav>
  );
}

function TierTabs({
  active,
  counts,
  onChange,
}: {
  active: EirRuleTier;
  counts: Map<EirRuleTier, number>;
  onChange: (tier: EirRuleTier) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('eirBuilder.palette.tierLabel', { defaultValue: 'ISO 19650 tier' })}
      className="flex items-stretch gap-0.5 rounded-md bg-muted/50 p-[clamp(0.125rem,0.2vw,0.25rem)] mx-[clamp(0.25rem,0.4vw,0.5rem)]"
    >
      {EIR_TIER_ORDER.map((tier) => {
        const selected = tier === active;
        const count = counts.get(tier) ?? 0;
        return (
          <button
            key={tier}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tier)}
            title={t(`eirBuilder.palette.tier_${tier}_long`, {
              defaultValue: EIR_TIER_LABELS[tier],
            })}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 rounded px-1 py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] font-semibold tracking-wide transition-colors',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{EIR_TIER_LABELS[tier]}</span>
            {count > 0 && (
              <span
                className={cn(
                  'tabular-nums text-[clamp(0.45rem,0.6vw,0.65rem)] font-medium',
                  selected ? 'text-muted-foreground' : 'text-muted-foreground/60'
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PaletteRow({
  rule,
  count,
  onAdd,
}: {
  rule: EirRuleDefinition;
  count: number;
  onAdd: (kind: EirRuleKind) => void;
}) {
  const { t } = useTranslation();
  const Icon = rule.icon;
  const max = ruleMaxInstances(rule);
  const atCap = count >= max;
  const unlimited = !Number.isFinite(max);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `palette-${rule.kind}`,
      data: { source: 'palette', kind: rule.kind },
      disabled: atCap,
    });

  // Translate the row while dragging — feels right because the user is
  // pulling a card across to the workspace; the overlay isn't strictly
  // needed for the structural cue.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleDoubleClick = () => {
    if (atCap) return;
    onAdd(rule.kind);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'group flex items-start gap-[clamp(0.375rem,0.6vw,0.75rem)] w-full rounded-md px-[clamp(0.375rem,0.6vw,0.75rem)] py-[clamp(0.375rem,0.55vh,0.625rem)] text-left transition-colors select-none',
        atCap
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-muted/60 cursor-grab active:cursor-grabbing'
      )}
      title={
        atCap
          ? t('settings.eir.paletteAtCap', {
              defaultValue: 'Already added (max {{max}})',
              max,
            })
          : t('settings.eir.paletteRowTitle', {
              defaultValue: 'Double-click to add — or drag to the workspace',
            })
      }
    >
      <GripVertical
        className={cn(
          'h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)] mt-[1px] shrink-0',
          atCap
            ? 'text-muted-foreground/40'
            : 'text-muted-foreground/50 group-hover:text-muted-foreground'
        )}
      />
      <Icon
        className={cn(
          'h-[clamp(0.875rem,1.05vw,1.05rem)] w-[clamp(0.875rem,1.05vw,1.05rem)] mt-[1px] shrink-0',
          count > 0
            ? 'text-primary'
            : 'text-muted-foreground group-hover:text-foreground'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1.5">
          <span
            className={cn(
              'text-[clamp(0.7rem,0.85vw,0.9rem)] font-medium truncate',
              count > 0 && 'text-primary'
            )}
          >
            {rule.title}
          </span>
          <CountBadge count={count} max={max} unlimited={unlimited} />
        </div>
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.4] mt-0.5">
          {rule.blurb}
        </p>
        <p className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-muted-foreground/70 mt-0.5 italic truncate">
          {t('eirBuilder.palette.responsibleRoleLabel', {
            defaultValue: 'Owner',
          })}
          {': '}
          {rule.responsibleRole}
        </p>
      </div>
    </div>
  );
}

function CountBadge({
  count,
  max,
  unlimited,
}: {
  count: number;
  max: number;
  unlimited: boolean;
}) {
  if (count === 0 && unlimited) return null;
  if (count === 0) return null;
  return (
    <span
      className={cn(
        'text-[clamp(0.5rem,0.65vw,0.7rem)] tabular-nums font-semibold px-1.5 py-0.5 rounded-full shrink-0',
        count >= max
          ? 'bg-muted text-muted-foreground'
          : 'bg-primary/15 text-primary'
      )}
    >
      {unlimited ? count : `${count}/${max}`}
    </span>
  );
}
