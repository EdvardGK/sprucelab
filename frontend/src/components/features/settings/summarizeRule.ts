import type { ActiveEirRule, EirRuleDefinition } from './eirRules';
import type { AddressValue } from './eirConfig';

/**
 * Compact one-line summary of a rule's current config — shown in the
 * card header when collapsed. Picks up to three non-empty field values
 * and formats them with the · separator. Toggles show their label only
 * if true; addresses show the adressetekst; arrays show their count.
 */
export function summarizeRule(
  rule: ActiveEirRule,
  def: EirRuleDefinition
): string {
  const parts: string[] = [];
  for (const field of def.fields) {
    if (parts.length >= 3) break;
    const v = rule.config[field.id];
    if (v === undefined || v === null || v === '') continue;

    if (typeof v === 'boolean') {
      if (v) parts.push(field.label);
      continue;
    }
    if (typeof v === 'number') {
      const suffix = field.unit ? ` ${field.unit}` : '';
      parts.push(`${field.label}: ${v}${suffix}`);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      const options = field.options ?? [];
      if (v.length === 1) {
        const opt = options.find((o) => o.value === v[0]);
        parts.push(opt?.label ?? String(v[0]));
      } else {
        parts.push(`${v.length} ${field.label.toLowerCase()}`);
      }
      continue;
    }
    if (typeof v === 'object' && 'adressetekst' in v) {
      parts.push((v as AddressValue).adressetekst);
      continue;
    }
    if (typeof v === 'string') {
      if (field.options) {
        const opt = field.options.find((o) => o.value === v);
        parts.push(opt?.label ?? v);
      } else {
        parts.push(v);
      }
      continue;
    }
  }
  return parts.join(' · ');
}
