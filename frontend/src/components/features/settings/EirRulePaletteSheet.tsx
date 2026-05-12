import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EirRulePalette } from './EirRulePalette';
import type { EirRuleKind, EirRuleTier } from './eirRules';

interface EirRulePaletteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kindCounts: Map<EirRuleKind, number>;
  onAdd: (kind: EirRuleKind) => void;
  /** Tier filter from the page header (mirrors the workspace). */
  tier: EirRuleTier | 'all';
  /**
   * Disabled when the user lacks edit access. The trigger button is
   * not rendered if `disabled` — we don't want a teasing CTA the user
   * can't act on.
   */
  disabled?: boolean;
}

/**
 * "+ Add rule" trigger + slide-from-right popover containing the
 * `<EirRulePalette>`. Replaces the old permanent palette sidebar.
 * The popover is wide-but-bounded (`clamp(20rem, 28vw, 26rem)`) and
 * scrolls internally — never the page.
 *
 * Why a Popover instead of a Dialog: the user often adds 2–3 rules
 * in a row. A Popover keeps the document beneath visible (light
 * focus loss), while a full Dialog steals attention each time.
 */
export function EirRulePaletteSheet({
  open,
  onOpenChange,
  kindCounts,
  onAdd,
  tier,
  disabled = false,
}: EirRulePaletteSheetProps) {
  const { t } = useTranslation();
  if (disabled) return null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-[clamp(0.25rem,0.4vw,0.5rem)] rounded-md bg-primary text-primary-foreground px-[clamp(0.625rem,1vw,1rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] font-semibold shadow-sm hover:bg-primary/90 transition-colors'
          )}
          title={t('eirBuilder.addRule.title', {
            defaultValue: 'Open the rule palette',
          })}
        >
          <Plus className="h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)]" />
          <span>{t('eirBuilder.addRule.label', { defaultValue: 'Add rule' })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          'w-[clamp(20rem,28vw,26rem)] max-h-[min(38rem,80vh)] overflow-y-auto p-[clamp(0.5rem,1vw,0.875rem)]'
        )}
      >
        <EirRulePalette
          kindCounts={kindCounts}
          onAdd={onAdd}
          tier={tier}
        />
      </PopoverContent>
    </Popover>
  );
}
