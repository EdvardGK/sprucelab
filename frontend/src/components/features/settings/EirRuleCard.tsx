import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EirConfigurator,
  type EirFieldValue,
} from './EirConfigurator';
import {
  EIR_RULE_BY_KIND,
  EIR_TIER_LABELS,
  type ActiveEirRule,
} from './eirRules';
import { summarizeRule } from './summarizeRule';

export type EirCardMode = 'view' | 'edit';

interface EirRuleCardProps {
  rule: ActiveEirRule;
  onConfigChange: (id: string, fieldId: string, value: EirFieldValue) => void;
  onRemove: (id: string) => void;
  /** View mode hides drag handle + X + swaps inputs to read-only. */
  mode?: EirCardMode;
}

/**
 * One EIR rule = one card on the workspace grid. Cards collapse to a
 * scannable chip-line summary so a workspace of 10+ rules stays
 * readable. Drag handle lives on the left edge of the header; X
 * (hover-only) on the right. Header click toggles collapse.
 *
 * In `mode="view"`, drag handles and the remove button are hidden, and
 * the body renders as a read-only `<dl>` of field values.
 */
export function EirRuleCard({
  rule,
  onConfigChange,
  onRemove,
  mode = 'edit',
}: EirRuleCardProps) {
  const { t } = useTranslation();
  const def = EIR_RULE_BY_KIND[rule.kind];
  const [collapsed, setCollapsed] = useState(false);
  const isEdit = mode === 'edit';
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id, disabled: !isEdit });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 30 : undefined,
  };

  const Icon = def.icon;
  const summary = summarizeRule(rule, def);
  const showBody = !collapsed && !isDragging;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex flex-col rounded-lg border bg-card border-border/60 shadow-sm hover:shadow-md transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/30'
      )}
    >
      <header
        className={cn(
          'flex items-center gap-1.5 px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.375rem,0.6vh,0.625rem)]',
          showBody && 'border-b border-border/40'
        )}
      >
        {isEdit && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground -ml-1 p-0.5 rounded touch-none shrink-0"
            title={t('settings.eir.dragHandle', { defaultValue: 'Drag to reorder' })}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)]" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left rounded -ml-0.5 px-0.5 hover:bg-muted/30 py-0.5"
          title={
            collapsed
              ? t('settings.eir.expand', { defaultValue: 'Expand' })
              : t('settings.eir.collapse', { defaultValue: 'Collapse' })
          }
        >
          {collapsed ? (
            <ChevronRight className="h-[clamp(0.625rem,0.85vw,0.85rem)] w-[clamp(0.625rem,0.85vw,0.85rem)] text-muted-foreground/60 shrink-0" />
          ) : (
            <ChevronDown className="h-[clamp(0.625rem,0.85vw,0.85rem)] w-[clamp(0.625rem,0.85vw,0.85rem)] text-muted-foreground/60 shrink-0" />
          )}
          <Icon className="h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)] text-muted-foreground shrink-0" />
          <h3 className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-semibold tracking-tight truncate flex-1 min-w-0">
            {def.title}
          </h3>
          <span
            className="text-[clamp(0.45rem,0.6vw,0.65rem)] font-semibold tracking-wide text-muted-foreground/80 rounded px-1 py-0.5 bg-muted/60 shrink-0"
            title={t('eirBuilder.card.tierBadge', {
              defaultValue: 'ISO 19650 tier',
            })}
          >
            {EIR_TIER_LABELS[def.tier]}
          </span>
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(rule.id);
            }}
            className="h-[clamp(1.25rem,1.5vw,1.5rem)] w-[clamp(1.25rem,1.5vw,1.5rem)] inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/60 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title={t('settings.eir.removeRule', { defaultValue: 'Remove rule' })}
          >
            <X className="h-[clamp(0.625rem,0.85vw,0.85rem)] w-[clamp(0.625rem,0.85vw,0.85rem)]" />
          </button>
        )}
      </header>

      {collapsed && summary && (
        <div className="px-[clamp(0.625rem,1vw,1rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] text-[clamp(0.6rem,0.72vw,0.78rem)] text-muted-foreground leading-[1.45] line-clamp-2">
          {summary}
        </div>
      )}

      {showBody && (
        <div className="px-[clamp(0.625rem,1vw,1rem)] py-[clamp(0.5rem,0.8vh,0.875rem)]">
          <EirConfigurator
            fields={def.fields}
            values={rule.config as Record<string, EirFieldValue>}
            onChange={(fieldId, value) => onConfigChange(rule.id, fieldId, value)}
            readOnly={!isEdit}
          />
        </div>
      )}
    </section>
  );
}
