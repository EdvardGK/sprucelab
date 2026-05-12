import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EIR_RULES,
  EIR_GROUP_LABELS,
  EIR_GROUP_ORDER,
  type EirRuleKind,
} from './eirRules';

interface EirRulePaletteProps {
  /** Kinds already on the workspace — palette items are dimmed but still clickable. */
  activeKinds: Set<EirRuleKind>;
  onAdd: (kind: EirRuleKind) => void;
}

/**
 * Sidebar palette listing every EIR rule kind grouped by category.
 * Click a row to append a new rule card to the workspace. The same
 * kind can be added multiple times (e.g. two "address" rules for two
 * sites); the dimmed state is informational, not blocking.
 */
export function EirRulePalette({ activeKinds, onAdd }: EirRulePaletteProps) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-[clamp(0.625rem,1vh,1rem)]">
      <header className="px-[clamp(0.25rem,0.4vw,0.5rem)]">
        <h2 className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-semibold tracking-tight">
          {t('settings.eir.paletteTitle', { defaultValue: 'Rule palette' })}
        </h2>
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.45] mt-0.5">
          {t('settings.eir.paletteHint', {
            defaultValue:
              'Click to add. Drag cards in the workspace to reorder.',
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
              {rules.map((rule) => {
                const Icon = rule.icon;
                const active = activeKinds.has(rule.kind);
                return (
                  <li key={rule.kind}>
                    <button
                      type="button"
                      onClick={() => onAdd(rule.kind)}
                      className={cn(
                        'group flex items-start gap-[clamp(0.375rem,0.6vw,0.75rem)] w-full rounded-md px-[clamp(0.375rem,0.6vw,0.75rem)] py-[clamp(0.375rem,0.55vh,0.625rem)] text-left transition-colors',
                        'hover:bg-muted/60'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-[clamp(0.875rem,1.05vw,1.05rem)] w-[clamp(0.875rem,1.05vw,1.05rem)] mt-[1px] shrink-0',
                          active
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span
                            className={cn(
                              'text-[clamp(0.7rem,0.85vw,0.9rem)] font-medium truncate',
                              active && 'text-primary'
                            )}
                          >
                            {rule.title}
                          </span>
                          <Plus
                            className={cn(
                              'h-[clamp(0.625rem,0.8vw,0.8rem)] w-[clamp(0.625rem,0.8vw,0.8rem)] shrink-0 transition-opacity',
                              active
                                ? 'opacity-30 group-hover:opacity-70'
                                : 'opacity-60 group-hover:opacity-100'
                            )}
                          />
                        </div>
                        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground leading-[1.4] mt-0.5">
                          {rule.blurb}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
