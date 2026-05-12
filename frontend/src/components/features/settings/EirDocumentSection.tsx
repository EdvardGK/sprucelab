import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import {
  EIR_TIER_DESCRIPTIONS,
  EIR_TIER_LABELS,
  EIR_TIER_LONG_LABELS,
  type ActiveEirRule,
  type EirRuleTier,
} from './eirRules';
import { EirRuleCard, type EirCardMode } from './EirRuleCard';
import type { EirFieldValue } from './EirConfigurator';

interface EirDocumentSectionProps {
  tier: EirRuleTier;
  rules: ActiveEirRule[];
  mode: EirCardMode;
  onConfigChange: (id: string, fieldId: string, value: EirFieldValue) => void;
  onRemove: (id: string) => void;
  /** Open the rule palette pre-filtered to this tier. Edit mode only. */
  onAddRuleToTier: (tier: EirRuleTier) => void;
}

/**
 * One section of the EIR document — corresponds to one ISO 19650 tier
 * (OIR / AIR / PIR / EIR). Header carries tier name + description +
 * a small "+ Add rule" CTA visible only in edit mode.
 *
 * The section is its own dnd-kit droppable + sortable scope so the
 * palette popover can drop rules into a specific tier and so reorder
 * happens inside a tier (cross-tier reorder isn't meaningful — tier
 * comes from the rule definition, not user choice).
 *
 * Layout: one column on lg-, two columns at xl+. Uniform card heights
 * keep the document scannable.
 */
export function EirDocumentSection({
  tier,
  rules,
  mode,
  onConfigChange,
  onRemove,
  onAddRuleToTier,
}: EirDocumentSectionProps) {
  const { t } = useTranslation();
  const droppableId = `eir-section-${tier}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { tier },
    disabled: mode !== 'edit',
  });
  const isEdit = mode === 'edit';
  const tierLong = t(`eirBuilder.tier.${tier}.long`, {
    defaultValue: EIR_TIER_LONG_LABELS[tier],
  });
  const tierDescription = t(`eirBuilder.tier.${tier}.description`, {
    defaultValue: EIR_TIER_DESCRIPTIONS[tier],
  });

  return (
    <section
      aria-labelledby={`eir-tier-${tier}-heading`}
      className={cn(
        'flex flex-col gap-[clamp(0.625rem,1vh,1rem)] rounded-lg transition-colors',
        isOver && isEdit && 'bg-primary/5 ring-1 ring-primary/30 p-[clamp(0.5rem,1vw,1rem)] -m-[clamp(0.5rem,1vw,1rem)]'
      )}
    >
      <header className="flex items-baseline justify-between gap-[clamp(0.5rem,1vw,1rem)] flex-wrap">
        <div className="flex items-baseline gap-[clamp(0.375rem,0.75vw,0.75rem)] flex-wrap min-w-0">
          <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary px-[clamp(0.375rem,0.6vw,0.625rem)] py-[clamp(0.125rem,0.2vh,0.25rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] font-bold tracking-wider tabular-nums">
            {EIR_TIER_LABELS[tier]}
          </span>
          <h2
            id={`eir-tier-${tier}-heading`}
            className="text-[clamp(0.85rem,1.1vw,1.1rem)] font-semibold tracking-tight"
          >
            {tierLong}
          </h2>
          <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground tabular-nums shrink-0">
            {t('eirBuilder.tier.ruleCount', {
              defaultValue: '{{count}} rule(s)',
              count: rules.length,
            })}
          </span>
        </div>
        {isEdit && (
          <button
            type="button"
            onClick={() => onAddRuleToTier(tier)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 px-[clamp(0.5rem,0.8vw,0.75rem)] py-[clamp(0.25rem,0.4vh,0.375rem)] text-[clamp(0.6rem,0.75vw,0.78rem)] text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/40 transition-colors"
            title={t('eirBuilder.tier.addCta', {
              defaultValue: 'Add a rule to this tier',
            })}
          >
            <Plus className="h-[clamp(0.7rem,0.85vw,0.85rem)] w-[clamp(0.7rem,0.85vw,0.85rem)]" />
            <span>
              {t('eirBuilder.tier.addShort', { defaultValue: 'Add rule' })}
            </span>
          </button>
        )}
      </header>
      <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground leading-[1.5] max-w-[80ch] -mt-1">
        {tierDescription}
      </p>

      <div ref={setNodeRef}>
        {rules.length === 0 ? (
          <EmptyTierState tier={tier} mode={mode} onAddRule={onAddRuleToTier} />
        ) : (
          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
            disabled={!isEdit}
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[clamp(0.75rem,1.2vw,1.25rem)] items-start">
              {rules.map((rule) => (
                <EirRuleCard
                  key={rule.id}
                  rule={rule}
                  onConfigChange={onConfigChange}
                  onRemove={onRemove}
                  mode={mode}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function EmptyTierState({
  tier,
  mode,
  onAddRule,
}: {
  tier: EirRuleTier;
  mode: EirCardMode;
  onAddRule: (tier: EirRuleTier) => void;
}) {
  const { t } = useTranslation();
  const isEdit = mode === 'edit';
  return (
    <div className="rounded-lg border border-dashed border-border/50 px-[clamp(0.875rem,1.5vw,1.5rem)] py-[clamp(1rem,2vh,1.75rem)] text-center">
      <p className="text-[clamp(0.65rem,0.8vw,0.82rem)] text-muted-foreground">
        {isEdit
          ? t('eirBuilder.tier.emptyEdit', {
              defaultValue: 'No {{tier}} rules yet. Click + to add the first one.',
              tier: EIR_TIER_LABELS[tier],
            })
          : t('eirBuilder.tier.emptyView', {
              defaultValue: 'No {{tier}} rules yet.',
              tier: EIR_TIER_LABELS[tier],
            })}
      </p>
      {isEdit && (
        <button
          type="button"
          onClick={() => onAddRule(tier)}
          className="mt-[clamp(0.5rem,1vh,0.875rem)] inline-flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/15 text-primary px-[clamp(0.5rem,0.8vw,0.75rem)] py-[clamp(0.25rem,0.4vh,0.375rem)] text-[clamp(0.6rem,0.75vw,0.78rem)] font-semibold transition-colors"
        >
          <Plus className="h-[clamp(0.7rem,0.85vw,0.85rem)] w-[clamp(0.7rem,0.85vw,0.85rem)]" />
          {t('eirBuilder.tier.addFirst', { defaultValue: 'Add the first rule' })}
        </button>
      )}
    </div>
  );
}
