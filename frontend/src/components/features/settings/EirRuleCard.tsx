import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EirConfigurator,
  type EirFieldValue,
} from './EirConfigurator';
import { EIR_RULE_BY_KIND, type ActiveEirRule } from './eirRules';

interface EirRuleCardProps {
  rule: ActiveEirRule;
  onConfigChange: (id: string, fieldId: string, value: EirFieldValue) => void;
  onRemove: (id: string) => void;
}

export function EirRuleCard({
  rule,
  onConfigChange,
  onRemove,
}: EirRuleCardProps) {
  const { t } = useTranslation();
  const def = EIR_RULE_BY_KIND[rule.kind];
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };

  const Icon = def.icon;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-[clamp(0.625rem,1vh,1rem)] rounded-lg border bg-card p-[clamp(0.75rem,1.2vw,1.25rem)] border-border/60',
        isDragging && 'shadow-lg ring-1 ring-primary/30'
      )}
    >
      <header className="flex items-center gap-[clamp(0.375rem,0.6vw,0.75rem)]">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground -ml-1 p-1 rounded touch-none"
          title={t('settings.eir.dragHandle', { defaultValue: 'Drag to reorder' })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-[clamp(0.875rem,1.1vw,1.125rem)] w-[clamp(0.875rem,1.1vw,1.125rem)]" />
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Icon className="h-[clamp(0.875rem,1.1vw,1.125rem)] w-[clamp(0.875rem,1.1vw,1.125rem)] text-muted-foreground shrink-0" />
          <h3 className="text-[clamp(0.8rem,1vw,1.05rem)] font-semibold tracking-tight truncate">
            {def.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onRemove(rule.id)}
          className="h-[clamp(1.5rem,1.8vw,1.875rem)] w-[clamp(1.5rem,1.8vw,1.875rem)] inline-flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
          title={t('settings.eir.removeRule', { defaultValue: 'Remove rule' })}
        >
          <X className="h-[clamp(0.75rem,0.95vw,1rem)] w-[clamp(0.75rem,0.95vw,1rem)]" />
        </button>
      </header>

      <EirConfigurator
        fields={def.fields}
        values={rule.config as Record<string, EirFieldValue>}
        onChange={(fieldId, value) => onConfigChange(rule.id, fieldId, value)}
      />
    </section>
  );
}
