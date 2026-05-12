import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { EirConfigurator, type EirFieldValue } from './EirConfigurator';
import {
  EIR_RULE_BY_KIND,
  EIR_TIER_LABELS,
  EIR_TIER_LONG_LABELS,
  EIR_TIER_ORDER,
  type ActiveEirRule,
} from './eirRules';

interface EirRuleViewRendererProps {
  rules: ActiveEirRule[];
}

/**
 * Compact, static "this is what your EIR looks like" preview used in
 * the Document tab of the right preview panel. Same `<dl>` body as
 * each rule card's view mode, but stacked tightly so the entire
 * document fits in a panel without extra chrome.
 *
 * Useful to spot tier sections with no rules (gaps) and to share /
 * print the whole document at once.
 */
export function EirRuleViewRenderer({ rules }: EirRuleViewRendererProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-[clamp(0.625rem,1vh,1rem)]">
      {EIR_TIER_ORDER.map((tier) => {
        const tierRules = rules.filter(
          (r) => EIR_RULE_BY_KIND[r.kind].tier === tier
        );
        const tierLong = t(`eirBuilder.tier.${tier}.long`, {
          defaultValue: EIR_TIER_LONG_LABELS[tier],
        });
        return (
          <section key={tier} className="flex flex-col gap-1">
            <header className="flex items-baseline gap-1.5 border-b border-border/40 pb-1">
              <span className="inline-flex items-center justify-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[clamp(0.5rem,0.65vw,0.7rem)] font-bold tracking-wider tabular-nums">
                {EIR_TIER_LABELS[tier]}
              </span>
              <h3 className="text-[clamp(0.65rem,0.8vw,0.85rem)] font-semibold truncate">
                {tierLong}
              </h3>
              <span className="ml-auto text-[clamp(0.5rem,0.65vw,0.7rem)] tabular-nums text-muted-foreground shrink-0">
                {tierRules.length}
              </span>
            </header>
            {tierRules.length === 0 ? (
              <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-muted-foreground italic py-1">
                {t('eirBuilder.tier.emptyView', {
                  defaultValue: 'No {{tier}} rules yet.',
                  tier: EIR_TIER_LABELS[tier],
                })}
              </p>
            ) : (
              <div className="flex flex-col gap-[clamp(0.5rem,0.8vh,0.875rem)]">
                {tierRules.map((rule) => (
                  <RulePreview key={rule.id} rule={rule} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RulePreview({ rule }: { rule: ActiveEirRule }) {
  const def = EIR_RULE_BY_KIND[rule.kind];
  const Icon = def.icon;
  return (
    <div
      className={cn(
        'rounded-md border border-border/40 bg-card/50 px-[clamp(0.5rem,0.8vw,0.75rem)] py-[clamp(0.375rem,0.6vh,0.625rem)]'
      )}
    >
      <header className="flex items-center gap-1.5 mb-1">
        <Icon className="h-[clamp(0.625rem,0.85vw,0.85rem)] w-[clamp(0.625rem,0.85vw,0.85rem)] text-muted-foreground shrink-0" />
        <h4 className="text-[clamp(0.65rem,0.8vw,0.82rem)] font-semibold truncate">
          {def.title}
        </h4>
      </header>
      <EirConfigurator
        fields={def.fields}
        values={rule.config as Record<string, EirFieldValue>}
        onChange={() => undefined}
        readOnly
      />
    </div>
  );
}
