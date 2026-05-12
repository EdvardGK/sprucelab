import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EIR_RULES,
  EIR_GROUP_LABELS,
  EIR_GROUP_ORDER,
  ruleMaxInstances,
  type EirRuleDefinition,
  type EirRuleKind,
} from './eirRules';

interface EirRulePaletteProps {
  /** kind → how many instances currently in the workspace. */
  kindCounts: Map<EirRuleKind, number>;
  onAdd: (kind: EirRuleKind) => void;
}

/**
 * Sidebar palette of every EIR rule kind. Two ways to add:
 *  - **Double-click** a row.
 *  - **Drag** a row onto the workspace.
 * Single click does nothing intentionally — avoids accidental adds.
 *
 * Rules at their `maxInstances` cap are visually disabled and not
 * draggable. Same-kind dupes are blocked at this layer.
 */
export function EirRulePalette({ kindCounts, onAdd }: EirRulePaletteProps) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-[clamp(0.625rem,1vh,1rem)]">
      <header className="px-[clamp(0.25rem,0.4vw,0.5rem)]">
        <h2 className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-semibold tracking-tight">
          {t('settings.eir.paletteTitle', { defaultValue: 'Rule palette' })}
        </h2>
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.45] mt-0.5">
          {t('settings.eir.paletteHint', {
            defaultValue: 'Double-click or drag a row into the workspace.',
          })}
        </p>
      </header>

      {EIR_GROUP_ORDER.map((group) => {
        const rules = EIR_RULES.filter((r) => r.group === group);
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
      })}
    </nav>
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
