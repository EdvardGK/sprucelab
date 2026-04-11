/**
 * IFCPropertiesPanel — Right panel in the federated viewer
 *
 * Shows raw IFC data for the selected element:
 * - Spatial path breadcrumb
 * - Element identity (name, class, GUID)
 * - Quantity grid (3x2)
 * - Collapsible property sets with count badges
 * - Material layers with colored bars
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ElementProperties } from './ElementPropertiesPanel';

interface IFCPropertiesPanelProps {
  element: ElementProperties | null;
  className?: string;
}

// Material color palette for layer bars
const MATERIAL_COLORS = [
  '#a1887f', '#90caf9', '#ce93d8', '#fff176', '#ef9a9a', '#e0e0e0',
  '#80cbc4', '#ffab91', '#b39ddb', '#c5e1a5',
];

export function IFCPropertiesPanel({ element, className }: IFCPropertiesPanelProps) {
  const { t } = useTranslation();

  if (!element) {
    return (
      <div className={cn('bg-card border-l border-border flex flex-col overflow-hidden', className)}>
        <div className="flex items-center justify-between px-2.5 py-[7px] border-b border-border bg-surface-muted flex-shrink-0">
          <h3 className="text-[11px] font-bold text-text-primary">{t('viewer.properties.title')}</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">
          {t('viewer.selectType')}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-card border-l border-border flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-[7px] border-b border-border bg-surface-muted flex-shrink-0">
        <h3 className="text-[11px] font-bold text-text-primary">{t('viewer.properties.title')}</h3>
        <span className="text-[8px] font-semibold uppercase tracking-wide px-[5px] py-px rounded-[3px] bg-surface-muted text-text-tertiary border border-border">
          IFC 4
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Spatial path */}
        <SpatialPath element={element} />

        {/* Element identity */}
        <ElementIdentity element={element} />

        {/* Quantities grid */}
        <QuantityGrid element={element} />

        {/* Property sets */}
        {element.psets && Object.entries(element.psets).map(([name, props]) => (
          <PsetGroup key={name} name={name} properties={props} />
        ))}

        {/* Materials */}
        {element.materials && element.materials.length > 0 && (
          <MaterialLayers materials={element.materials} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1 px-2.5 py-[5px] border-t border-border text-[8.5px] text-text-tertiary bg-surface-muted flex-shrink-0">
        <span>{t('viewer.properties.expressId')}:</span>
        <code className="font-mono text-[8.5px] text-text-secondary">#{element.expressID}</code>
      </div>
    </div>
  );
}

// ── Spatial Path ──

function SpatialPath({ element }: { element: ElementProperties }) {
  const parts = [
    element.site,
    element.building,
    element.storey,
  ].filter(Boolean) as string[];

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-[3px] flex-wrap px-2.5 py-1.5 text-[9.5px] text-text-tertiary border-b border-black/[0.03]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-[3px]">
          {i > 0 && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
          <span className="text-text-secondary font-medium">{part}</span>
        </span>
      ))}
    </div>
  );
}

// ── Element Identity ──

function ElementIdentity({ element }: { element: ElementProperties }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (element.guid) {
      navigator.clipboard.writeText(element.guid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [element.guid]);

  const displayName = element.name || element.objectType || element.type;

  return (
    <div className="px-2.5 py-2 border-b border-black/[0.04]">
      <div className="text-[13px] font-semibold leading-tight">{displayName}</div>
      <div className="flex items-center gap-[5px] mt-[3px]">
        <span className="inline-flex px-[5px] py-px bg-surface-muted rounded-[3px] text-[9.5px] font-medium text-text-secondary font-mono">
          {element.type}
        </span>
        {element.predefinedType && (
          <span className="text-[9px] text-text-tertiary">{element.predefinedType}</span>
        )}
      </div>
      {element.guid && (
        <div className="flex items-center gap-[3px] mt-[3px]">
          <span className="text-[9px] text-text-tertiary font-mono tracking-tight">{element.guid}</span>
          <button
            onClick={handleCopy}
            title={t('viewer.properties.copyGuid')}
            className="w-[15px] h-[15px] flex items-center justify-center border-none bg-transparent cursor-pointer text-text-tertiary rounded-[3px] hover:text-primary hover:bg-primary/10 transition-all"
          >
            {copied ? <Check className="w-[10px] h-[10px] text-primary" /> : <Copy className="w-[10px] h-[10px]" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Quantity Grid ──

function QuantityGrid({ element }: { element: ElementProperties }) {
  const quantities = [
    { value: element.length, unit: 'm', label: 'lengde' },
    { value: element.height, unit: 'm', label: 'høyde' },
    { value: element.width, unit: 'mm', label: 'bredde', transform: (v: number) => v * 1000 },
    { value: element.area, unit: 'm²', label: 'brutto' },
    { value: undefined, unit: 'm²', label: 'netto' }, // netto area not in ElementProperties
    { value: element.volume, unit: 'm³', label: 'volum' },
  ].filter(q => q.value != null || q.label === 'netto');

  if (quantities.every(q => q.value == null)) return null;

  return (
    <div className="grid grid-cols-3 gap-px bg-black/[0.03] border-b border-black/[0.04]">
      {quantities.map((q, i) => (
        <div key={i} className="px-1.5 py-[5px] bg-card text-center">
          <div className="text-xs font-bold text-text-primary tabular-nums">
            {q.value != null ? (q.transform ? q.transform(q.value).toFixed(0) : q.value.toFixed(2)) : '—'}
          </div>
          <div className="text-[8px] text-text-tertiary uppercase tracking-wide mt-px">
            {q.unit} {q.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Property Set Group ──

function PsetGroup({ name, properties }: { name: string; properties: Record<string, any> }) {
  const [expanded, setExpanded] = useState(name.includes('Common') || name.includes('Base'));
  const propCount = Object.keys(properties).length;

  return (
    <div className="border-b border-black/[0.03]">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 w-full px-2.5 py-[5px] text-[10px] font-semibold text-text-secondary hover:bg-black/[0.012] transition-colors cursor-pointer text-left"
      >
        {expanded ? <ChevronDown className="w-2 h-2 flex-shrink-0" /> : <ChevronRight className="w-2 h-2 flex-shrink-0" />}
        {name}
        <span className="ml-auto text-[8.5px] font-semibold text-text-tertiary bg-surface-muted px-1 rounded-[3px] leading-[15px]">
          {propCount}
        </span>
      </button>
      {expanded && (
        <div>
          {Object.entries(properties).map(([key, val]) => (
            <div key={key} className="flex px-2.5 pl-5 py-[2px] text-[10px]">
              <span className="flex-1 text-text-tertiary">{key}</span>
              <span className={cn(
                'flex-1 text-right font-medium tabular-nums',
                val === true || val === 'True' ? 'text-[var(--tl-green-text)]' : '',
                val === false || val === 'False' ? 'text-[var(--tl-red-text)]' : '',
                typeof val !== 'boolean' && val !== 'True' && val !== 'False' ? 'text-text-primary' : '',
              )}>
                {String(val)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Material Layers ──

function MaterialLayers({ materials }: { materials: NonNullable<ElementProperties['materials']> }) {
  const { t } = useTranslation();

  const totalThickness = materials.reduce((sum, m) => sum + (m.thickness ?? 0), 0);

  return (
    <div className="px-2.5 py-1.5 pb-2.5">
      <div className="text-[8.5px] font-bold uppercase tracking-wider text-text-tertiary mb-[5px]">
        {t('viewer.properties.materialLayers')}
      </div>
      <div className="flex flex-col gap-px border border-border rounded overflow-hidden">
        {materials.map((mat, i) => (
          <div key={i} className={cn(
            'flex items-center gap-[5px] px-[7px] py-1 text-[10px]',
            i % 2 === 0 ? 'bg-card' : 'bg-surface-hover',
          )}>
            <div
              className="w-[3px] rounded-full self-stretch min-h-4"
              style={{ background: MATERIAL_COLORS[i % MATERIAL_COLORS.length] }}
            />
            <span className="flex-1 text-text-primary font-medium">{mat.name}</span>
            {mat.thickness != null && (
              <span className="text-text-secondary tabular-nums text-[9.5px]">{mat.thickness} mm</span>
            )}
          </div>
        ))}
      </div>
      {totalThickness > 0 && (
        <div className="flex justify-between px-[7px] py-1 text-[10px] font-semibold bg-surface-muted text-text-primary border border-border border-t-0 rounded-b">
          <span>{t('viewer.properties.total')}</span>
          <span>{totalThickness} mm</span>
        </div>
      )}
    </div>
  );
}
