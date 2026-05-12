import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EIR_RULES,
  EIR_TIER_LABELS,
  EIR_TIER_LONG_LABELS,
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
  /**
   * Active ISO 19650 tier filter from the page header. When set to a
   * single tier (not 'all'), only rules under that tier are shown and
   * the tier groups collapse into one bare list. When 'all', rules are
   * shown grouped by tier with collapsible sections.
   */
  tier: EirRuleTier | 'all';
}

/**
 * Rule-kind list rendered inside the "+ Add rule" popover. Replaces
 * the old permanent palette sidebar. Rules are grouped by ISO 19650
 * tier (OIR / AIR / PIR / EIR) — each group is collapsible, all
 * expanded by default. Clicking a rule kind adds it via `onAdd`
 * (caller is expected to close the popover and scroll-to-new-rule).
 *
 * Drag is preserved: each row is a `useDraggable` source — the page-
 * level DndContext routes a palette-source drop into the matching
 * tier section.
 */
export function EirRulePalette({
  kindCounts,
  onAdd,
  tier,
}: EirRulePaletteProps) {
  const { t } = useTranslation();

  const visibleRules = useMemo(
    () => (tier === 'all' ? EIR_RULES : EIR_RULES.filter((r) => r.tier === tier)),
    [tier]
  );

  return (
    <div className="flex flex-col gap-[clamp(0.5rem,0.9vh,0.875rem)]">
      <header className="px-[clamp(0.25rem,0.4vw,0.5rem)]">
        <h2 className="text-[clamp(0.75rem,0.9vw,0.95rem)] font-semibold tracking-tight">
          {t('eirBuilder.palette.title', { defaultValue: 'Add a rule' })}
        </h2>
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.45] mt-0.5">
          {t('eirBuilder.palette.popoverHint', {
            defaultValue:
              'Click a rule to add it to the document — or drag it onto a tier section.',
          })}
        </p>
      </header>

      {visibleRules.length === 0 ? (
        <p className="px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.625rem,1vh,1rem)] text-[clamp(0.6rem,0.72vw,0.78rem)] text-muted-foreground italic leading-[1.5]">
          {t('eirBuilder.palette.tierEmpty', {
            defaultValue: 'No requirements in this tier yet',
          })}
        </p>
      ) : tier === 'all' ? (
        EIR_TIER_ORDER.map((tg) => {
          const rules = visibleRules.filter((r) => r.tier === tg);
          if (rules.length === 0) return null;
          return (
            <PaletteTierGroup
              key={tg}
              tier={tg}
              rules={rules}
              kindCounts={kindCounts}
              onAdd={onAdd}
            />
          );
        })
      ) : (
        <ul className="flex flex-col gap-0.5">
          {visibleRules.map((rule) => (
            <li key={rule.kind}>
              <PaletteRow
                rule={rule}
                count={kindCounts.get(rule.kind) ?? 0}
                onAdd={onAdd}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PaletteTierGroup({
  tier,
  rules,
  kindCounts,
  onAdd,
}: {
  tier: EirRuleTier;
  rules: EirRuleDefinition[];
  kindCounts: Map<EirRuleKind, number>;
  onAdd: (kind: EirRuleKind) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const tierLong = t(`eirBuilder.tier.${tier}.long`, {
    defaultValue: EIR_TIER_LONG_LABELS[tier],
  });
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-[clamp(0.375rem,0.6vw,0.75rem)] py-[clamp(0.25rem,0.4vh,0.375rem)] text-left rounded hover:bg-muted/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-[clamp(0.625rem,0.8vw,0.85rem)] w-[clamp(0.625rem,0.8vw,0.85rem)] text-muted-foreground/60 shrink-0" />
        ) : (
          <ChevronRight className="h-[clamp(0.625rem,0.8vw,0.85rem)] w-[clamp(0.625rem,0.8vw,0.85rem)] text-muted-foreground/60 shrink-0" />
        )}
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] font-bold tracking-wider text-primary tabular-nums">
          {EIR_TIER_LABELS[tier]}
        </span>
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground truncate">
          {tierLong}
        </span>
        <span className="ml-auto text-[clamp(0.5rem,0.65vw,0.7rem)] tabular-nums text-muted-foreground shrink-0">
          {rules.length}
        </span>
      </button>
      {open && (
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
      )}
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
      data: { source: 'palette', kind: rule.kind, tier: rule.tier },
      disabled: atCap,
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleClick = () => {
    if (atCap) return;
    onAdd(rule.kind);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-[clamp(0.375rem,0.6vw,0.75rem)] w-full rounded-md px-[clamp(0.375rem,0.6vw,0.75rem)] py-[clamp(0.375rem,0.55vh,0.625rem)] text-left transition-colors select-none',
        atCap
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-muted/60'
      )}
      title={
        atCap
          ? t('settings.eir.paletteAtCap', {
              defaultValue: 'Already added (max {{max}})',
              max,
            })
          : t('settings.eir.paletteRowTitle', {
              defaultValue: 'Click to add — or drag to a tier section',
            })
      }
    >
      {/* Drag handle (separate from click target) */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={atCap}
        className={cn(
          'shrink-0 cursor-grab active:cursor-grabbing -ml-1 p-0.5 rounded touch-none',
          atCap && 'cursor-not-allowed'
        )}
        title={t('eirBuilder.palette.dragTitle', { defaultValue: 'Drag' })}
      >
        <GripVertical
          className={cn(
            'h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)]',
            atCap
              ? 'text-muted-foreground/40'
              : 'text-muted-foreground/50 group-hover:text-muted-foreground'
          )}
        />
      </button>
      <button
        type="button"
        onClick={handleClick}
        disabled={atCap}
        className="flex-1 min-w-0 flex items-start gap-[clamp(0.375rem,0.6vw,0.75rem)] text-left"
      >
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
      </button>
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
