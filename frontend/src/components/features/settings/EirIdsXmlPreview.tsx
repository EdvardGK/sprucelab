import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  EIR_RULE_BY_KIND,
  type ActiveEirRule,
} from './eirRules';

interface EirIdsXmlPreviewProps {
  rules: ActiveEirRule[];
}

/**
 * IDS XML preview — STUB. buildingSMART IDS is sprucelab's chosen
 * bidirectional interop format (memory: `ids-as-interop-format.md`);
 * the backend will own the real export. This tab shows a placeholder
 * skeleton so the user can see the format taking shape and the copy
 * button works against the placeholder.
 *
 * When the backend IDS exporter lands (Phase 7), this component
 * swaps to fetching the actual XML from
 * `/api/projects/{id}/eir/export/ids/`.
 */
export function EirIdsXmlPreview({ rules }: EirIdsXmlPreviewProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const placeholderXml = useMemo(() => {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      '<ids xmlns="http://standards.buildingsmart.org/IDS"' +
        ' xmlns:xs="http://www.w3.org/2001/XMLSchema-instance"' +
        ' xs:schemaLocation="http://standards.buildingsmart.org/IDS ids.xsd">'
    );
    lines.push('  <info>');
    lines.push('    <title>Project EIR (sprucelab draft)</title>');
    lines.push(
      `    <description>Generated from ${rules.length} active rule(s). Backend export coming soon.</description>`
    );
    lines.push('  </info>');
    lines.push('  <specifications>');
    rules.forEach((rule, idx) => {
      const def = EIR_RULE_BY_KIND[rule.kind];
      lines.push(`    <!-- ${idx + 1}. ${def.title} (${def.tier.toUpperCase()}) -->`);
      lines.push(`    <specification name="${escapeXml(def.title)}" ifcVersion="IFC4">`);
      lines.push('      <applicability minOccurs="0" maxOccurs="unbounded">');
      lines.push('        <entity><name><simpleValue>IfcRoot</simpleValue></name></entity>');
      lines.push('      </applicability>');
      lines.push('      <requirements>');
      lines.push(`        <!-- ${escapeXml(def.blurb)} -->`);
      lines.push('      </requirements>');
      lines.push('    </specification>');
    });
    lines.push('  </specifications>');
    lines.push('</ids>');
    return lines.join('\n');
  }, [rules]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(placeholderXml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can fail (insecure context, permissions). Silent on
      // failure — the user can manually select-all from the <pre>.
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.25rem,0.4vh,0.5rem)] border-b border-border/40 shrink-0">
        <p className="text-[clamp(0.55rem,0.7vw,0.75rem)] text-amber-600 dark:text-amber-500">
          {t('eirBuilder.preview.idsStubNote', {
            defaultValue: 'IDS XML export — placeholder; backend export lands in Phase 7.',
          })}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[clamp(0.55rem,0.7vw,0.75rem)] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0',
            copied && 'text-emerald-600 dark:text-emerald-500'
          )}
        >
          {copied ? (
            <Check className="h-[clamp(0.625rem,0.8vw,0.85rem)] w-[clamp(0.625rem,0.8vw,0.85rem)]" />
          ) : (
            <Copy className="h-[clamp(0.625rem,0.8vw,0.85rem)] w-[clamp(0.625rem,0.8vw,0.85rem)]" />
          )}
          <span>
            {copied
              ? t('eirBuilder.preview.copied', { defaultValue: 'Copied' })
              : t('eirBuilder.preview.copy', { defaultValue: 'Copy' })}
          </span>
        </button>
      </div>
      <pre
        className="flex-1 min-h-0 overflow-auto px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.5rem,0.8vh,0.75rem)] text-[clamp(0.55rem,0.7vw,0.75rem)] leading-[1.5] font-mono whitespace-pre text-foreground/80 bg-muted/20"
        aria-label={t('eirBuilder.preview.idsAria', {
          defaultValue: 'IDS XML placeholder',
        })}
      >
        {placeholderXml}
      </pre>
    </div>
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
