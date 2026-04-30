/**
 * IFCPropertiesPanel — Right panel in the federated viewer
 *
 * Shows raw IFC data for the selected element:
 * - Spatial path breadcrumb
 * - Element identity (name, class, GUID)
 * - Filtered quantity grid with primary highlight on representative unit
 * - Key properties grid (IsExternal, LoadBearing, FireRating, U-value)
 * - Pset dropdown (one pset at a time)
 * - Material layers with EPD dots and qty-per-unit (continuous elements)
 * - Product info card (discrete elements: sinks, toilets, etc.)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ElementProperties } from './ElementPropertiesPanel';

interface IFCPropertiesPanelProps {
  element: ElementProperties | null;
  /**
   * Multi-select view: when 2+ elements are selected, show an aggregate
   * summary (count, type breakdown, summed quantities) instead of the single
   * element. Pass `[el]` for single-select; pass `null`/empty for empty state.
   */
  aggregate?: ElementProperties[];
  /** Optional close button on the header. Hidden when omitted. */
  onClose?: () => void;
  className?: string;
}

// ── Quantity config per IFC class ──

interface QtyConfig {
  quantities: Array<{
    key: keyof ElementProperties;
    unit: string;
    labelKey: string;
    transform?: (v: number) => number;
  }>;
  primaryKey: keyof ElementProperties;
}

const QTY_DEFAULTS: Record<string, QtyConfig> = {
  IfcWall: {
    quantities: [
      { key: 'area', unit: 'm²', labelKey: 'area' },
      { key: 'length', unit: 'm', labelKey: 'length' },
      { key: 'height', unit: 'm', labelKey: 'height' },
      { key: 'width', unit: 'mm', labelKey: 'thickness', transform: (v: number) => v * 1000 },
    ],
    primaryKey: 'area',
  },
  IfcCurtainWall: {
    quantities: [
      { key: 'area', unit: 'm²', labelKey: 'area' },
      { key: 'length', unit: 'm', labelKey: 'length' },
      { key: 'height', unit: 'm', labelKey: 'height' },
    ],
    primaryKey: 'area',
  },
  IfcSlab: {
    quantities: [
      { key: 'area', unit: 'm²', labelKey: 'area' },
      { key: 'volume', unit: 'm³', labelKey: 'volume' },
      { key: 'width', unit: 'mm', labelKey: 'thickness', transform: (v: number) => v * 1000 },
    ],
    primaryKey: 'area',
  },
  IfcRoof: {
    quantities: [
      { key: 'area', unit: 'm²', labelKey: 'area' },
      { key: 'volume', unit: 'm³', labelKey: 'volume' },
    ],
    primaryKey: 'area',
  },
  IfcBeam: {
    quantities: [
      { key: 'length', unit: 'm', labelKey: 'length' },
      { key: 'area', unit: 'cm²', labelKey: 'profileArea', transform: (v: number) => v * 10000 },
    ],
    primaryKey: 'length',
  },
  IfcColumn: {
    quantities: [
      { key: 'length', unit: 'm', labelKey: 'length' },
      { key: 'area', unit: 'cm²', labelKey: 'profileArea', transform: (v: number) => v * 10000 },
    ],
    primaryKey: 'length',
  },
  IfcMember: {
    quantities: [
      { key: 'length', unit: 'm', labelKey: 'length' },
      { key: 'area', unit: 'cm²', labelKey: 'profileArea', transform: (v: number) => v * 10000 },
    ],
    primaryKey: 'length',
  },
  IfcDoor: {
    quantities: [
      { key: 'width', unit: 'mm', labelKey: 'width', transform: (v: number) => v * 1000 },
      { key: 'height', unit: 'mm', labelKey: 'height', transform: (v: number) => v * 1000 },
    ],
    primaryKey: 'width',
  },
  IfcWindow: {
    quantities: [
      { key: 'width', unit: 'mm', labelKey: 'width', transform: (v: number) => v * 1000 },
      { key: 'height', unit: 'mm', labelKey: 'height', transform: (v: number) => v * 1000 },
    ],
    primaryKey: 'width',
  },
};

// Discrete IFC classes that show product card instead of material recipe
const DISCRETE_CLASSES = new Set([
  'IfcSanitaryTerminal', 'IfcFlowTerminal', 'IfcLightFixture',
  'IfcFurnishingElement', 'IfcDiscreteAccessory', 'IfcMechanicalFastener',
  'IfcElectricAppliance', 'IfcAudioVisualAppliance', 'IfcOutlet',
  'IfcSwitchingDevice', 'IfcSensor', 'IfcAlarm', 'IfcValve',
]);

function isDiscreteElement(element: ElementProperties): boolean {
  if (element.representativeUnit === 'count') return true;
  if (element.productInfo) return true;
  return DISCRETE_CLASSES.has(element.type);
}

// Material color palette for layer bars
const MATERIAL_COLORS = [
  '#a1887f', '#90caf9', '#ce93d8', '#fff176', '#ef9a9a', '#e0e0e0',
  '#80cbc4', '#ffab91', '#b39ddb', '#c5e1a5',
];

// ── Key properties extraction ──

const MISSING = '—';

interface KeyPropCell {
  value: string;
  label: string;
  variant: 'yes' | 'no' | 'rating' | 'value';
  isMissing: boolean;
}

function extractKeyProps(element: ElementProperties): KeyPropCell[] {
  const isExt = element.isExternal ?? findInPsets(element.psets, 'IsExternal');
  const loadB = element.loadBearing ?? findInPsets(element.psets, 'LoadBearing');
  const fire = element.fireRating ?? findInPsets(element.psets, 'FireRating');
  const uVal = element.thermalTransmittance ?? findInPsets(element.psets, 'ThermalTransmittance');

  const extBool = isExt !== undefined ? toBool(isExt) : null;
  const loadBool = loadB !== undefined ? toBool(loadB) : null;

  return [
    {
      label: 'isExternal',
      value: extBool === null ? MISSING : extBool ? 'Ja' : 'Nei',
      variant: extBool === null ? 'value' : extBool ? 'yes' : 'no',
      isMissing: extBool === null,
    },
    {
      label: 'loadBearing',
      value: loadBool === null ? MISSING : loadBool ? 'Ja' : 'Nei',
      variant: loadBool === null ? 'value' : loadBool ? 'yes' : 'no',
      isMissing: loadBool === null,
    },
    {
      label: 'fireRating',
      value: fire !== undefined && fire !== '' && fire !== null ? String(fire) : MISSING,
      variant: 'rating',
      isMissing: fire === undefined || fire === '' || fire === null,
    },
    {
      label: 'uValue',
      value:
        uVal !== undefined && uVal !== null
          ? typeof uVal === 'number'
            ? uVal.toFixed(2)
            : String(uVal)
          : MISSING,
      variant: 'value',
      isMissing: uVal === undefined || uVal === null,
    },
  ];
}

function findInPsets(psets: Record<string, Record<string, any>> | undefined, propName: string): any {
  if (!psets) return undefined;
  for (const props of Object.values(psets)) {
    if (propName in props) return props[propName];
  }
  return undefined;
}

function toBool(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return !!val;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function IFCPropertiesPanel({ element, aggregate, onClose, className }: IFCPropertiesPanelProps) {
  const { t } = useTranslation();

  // Aggregate view: 2+ selected.
  if (aggregate && aggregate.length > 1) {
    return <AggregateSummary aggregate={aggregate} onClose={onClose} className={className} />;
  }

  if (!element) {
    return (
      <div className={cn('bg-card border-l border-border flex flex-col overflow-hidden', className)}>
        <PanelHeader title={t('viewer.properties.title')} onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">
          {t('viewer.selectType')}
        </div>
      </div>
    );
  }

  const discrete = isDiscreteElement(element);

  return (
    <div className={cn('bg-card border-l border-border flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <PanelHeader title={t('viewer.properties.title')} onClose={onClose} ifcBadge />


      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <SpatialPath element={element} />
        <ElementIdentity element={element} />

        {discrete ? (
          <DiscreteProductCard element={element} />
        ) : (
          <>
            <QuantityGrid element={element} />
            <KeyPropertiesGrid element={element} />
            <PsetDropdown element={element} />
            <MaterialLayers element={element} />
          </>
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

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

// ── Spatial Path ──

function SpatialPath({ element }: { element: ElementProperties }) {
  const parts: Array<string | null> = [
    element.site ?? null,
    element.building ?? null,
    element.storey ?? null,
  ];

  return (
    <div className="flex items-center gap-[3px] flex-wrap px-2.5 py-1.5 text-[9.5px] text-text-tertiary border-b border-black/[0.03]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-[3px]">
          {i > 0 && <ChevronSvg />}
          <span className={cn('font-medium', part ? 'text-text-secondary' : 'text-text-tertiary opacity-50')}>
            {part ?? MISSING}
          </span>
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

// ── Quantity Grid (filtered by IFC class, primary highlight on rep unit) ──

interface QtyCell {
  value: number | null;
  unit: string;
  label: string;
  isPrimary: boolean;
}

function QuantityGrid({ element }: { element: ElementProperties }) {
  const { t } = useTranslation();
  const config = QTY_DEFAULTS[element.type];

  // Always render all configured slots; missing values become null placeholders.
  const cells: QtyCell[] = config
    ? config.quantities.map(q => {
        const raw = element[q.key];
        const value =
          raw != null
            ? q.transform
              ? q.transform(raw as number)
              : (raw as number)
            : null;
        return {
          value,
          unit: q.unit,
          label: t(`viewer.properties.${q.labelKey}`),
          isPrimary: q.key === config.primaryKey,
        };
      })
    : buildFallbackQuantities(element, t);

  return (
    <div className="flex gap-px bg-black/[0.03] border-b border-black/[0.04]">
      {cells.map((cell, i) => {
        const missing = cell.value == null;
        return (
          <div
            key={i}
            className={cn(
              'flex-1 px-1.5 py-[6px] text-center',
              cell.isPrimary && !missing ? 'bg-[var(--primary-light)]' : 'bg-card',
            )}
          >
            <div
              className={cn(
                'text-[14px] font-bold tabular-nums',
                cell.isPrimary && !missing ? 'text-[var(--primary)]' : 'text-text-primary',
                missing && 'opacity-40',
              )}
            >
              {missing ? MISSING : formatQty(cell.value!)}
            </div>
            <div
              className={cn(
                'text-[8px] uppercase tracking-wide mt-px',
                cell.isPrimary && !missing ? 'text-[var(--primary)] opacity-70' : 'text-text-tertiary',
              )}
            >
              {cell.unit} {cell.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildFallbackQuantities(element: ElementProperties, t: (key: string) => string): QtyCell[] {
  // Default slot layout when we have no per-class config: always render all five.
  return [
    { value: element.area ?? null, unit: 'm²', label: t('viewer.properties.area'), isPrimary: true },
    { value: element.length ?? null, unit: 'm', label: t('viewer.properties.length'), isPrimary: false },
    { value: element.height ?? null, unit: 'm', label: t('viewer.properties.height'), isPrimary: false },
    {
      value: element.width != null ? element.width * 1000 : null,
      unit: 'mm',
      label: t('viewer.properties.thickness'),
      isPrimary: false,
    },
    { value: element.volume ?? null, unit: 'm³', label: t('viewer.properties.volume'), isPrimary: false },
  ];
}

function formatQty(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

// ── Key Properties Grid ──

function KeyPropertiesGrid({ element }: { element: ElementProperties }) {
  const { t } = useTranslation();
  const props = extractKeyProps(element);

  return (
    <div
      className="grid gap-px bg-black/[0.03] border-b border-black/[0.04]"
      style={{ gridTemplateColumns: `repeat(${props.length}, 1fr)` }}
    >
      {props.map((p, i) => (
        <div key={i} className="px-[6px] py-[5px] bg-card text-center">
          <div
            className={cn(
              'text-xs font-bold tabular-nums',
              p.isMissing && 'text-text-tertiary opacity-40',
              !p.isMissing && p.variant === 'yes' && 'text-[var(--tl-green-text)]',
              !p.isMissing && p.variant === 'no' && 'text-[var(--tl-red-text)]',
              !p.isMissing && (p.variant === 'rating' || p.variant === 'value') && 'text-text-primary',
            )}
          >
            {p.value}
          </div>
          <div className="text-[8px] text-text-tertiary uppercase tracking-wide mt-px">
            {t(`viewer.properties.${p.label}`)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pset Dropdown ──

function PsetDropdown({ element }: { element: ElementProperties }) {
  const [open, setOpen] = useState(false);
  const [selectedPset, setSelectedPset] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const psetEntries = element.psets ? Object.entries(element.psets) : [];
  const hasPsets = psetEntries.length > 0;

  // Auto-select first pset (prefer *Common)
  const activeName = hasPsets
    ? selectedPset ?? psetEntries.find(([n]) => n.includes('Common'))?.[0] ?? psetEntries[0][0]
    : null;
  const activeProps = hasPsets && activeName ? element.psets?.[activeName] ?? {} : {};
  const propCount = Object.keys(activeProps).length;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      {/* Dropdown trigger */}
      <div className="px-2.5 py-1" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => hasPsets && setOpen(o => !o)}
            disabled={!hasPsets}
            className={cn(
              'flex items-center gap-1 w-full px-2 py-1 border border-border rounded bg-card text-[10px] font-semibold text-text-secondary transition-all',
              hasPsets
                ? 'cursor-pointer hover:border-border-strong hover:shadow-sm'
                : 'cursor-default opacity-60',
            )}
          >
            <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left">
              {activeName ?? 'No property sets'}
            </span>
            <span className="text-[8.5px] font-semibold text-text-tertiary bg-surface-muted px-1 rounded-[3px] leading-[15px] flex-shrink-0">
              {propCount}
            </span>
            <ChevronDown className={cn('w-2.5 h-2.5 text-text-tertiary flex-shrink-0 transition-transform', open && 'rotate-180', !hasPsets && 'opacity-40')} />
          </button>

          {/* Dropdown menu */}
          {open && hasPsets && (
            <div className="absolute top-full left-0 right-0 mt-0.5 z-10 bg-card border border-border rounded shadow-md overflow-hidden">
              {psetEntries.map(([name, props]) => (
                <button
                  key={name}
                  onClick={() => { setSelectedPset(name); setOpen(false); }}
                  className={cn(
                    'flex items-center gap-1 w-full px-2 py-[4px] text-[10px] text-left cursor-pointer transition-colors',
                    name === activeName
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-text-secondary hover:bg-black/[0.02]',
                  )}
                >
                  <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
                  <span className="text-[8.5px] text-text-tertiary bg-surface-muted px-1 rounded-[3px] leading-[15px] flex-shrink-0">
                    {Object.keys(props).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active pset rows */}
      <div className="border-t border-black/[0.03]">
        {!hasPsets && (
          <div className="flex px-2.5 py-[3px] text-[10px] text-text-tertiary opacity-60 italic">
            No property sets on this element
          </div>
        )}
        {Object.entries(activeProps).map(([key, val]) => (
          <div key={key} className="flex px-2.5 py-[2.5px] text-[10px]">
            <span className="flex-1 text-text-tertiary">{key}</span>
            <span className={cn(
              'flex-1 text-right font-medium tabular-nums',
              (val === true || val === 'True') && 'text-[var(--tl-green-text)]',
              (val === false || val === 'False') && 'text-[var(--tl-red-text)]',
              typeof val !== 'boolean' && val !== 'True' && val !== 'False' && 'text-text-primary',
            )}>
              {String(val)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Material Layers (continuous elements) ──

function MaterialLayers({ element }: { element: ElementProperties }) {
  const { t } = useTranslation();
  const materials = element.materials ?? [];
  const hasMaterials = materials.length > 0;

  const totalThickness = materials.reduce((sum, m) => sum + (m.thickness ?? 0), 0);
  const epdLinked = materials.filter(m => m.hasEpd).length;
  const repUnit = element.representativeUnit === 'area' ? 'm²'
    : element.representativeUnit === 'length' ? 'm'
    : element.representativeUnit === 'volume' ? 'm³'
    : 'm²'; // default for walls

  if (!hasMaterials) {
    return (
      <div className="px-2.5 py-1.5 pb-2.5">
        <div className="text-[8.5px] font-bold uppercase tracking-wider text-text-tertiary mb-[5px]">
          {t('viewer.properties.materialLayers')}
        </div>
        <div className="border border-dashed border-border rounded px-[7px] py-2 text-[10px] text-text-tertiary italic opacity-60">
          No material layers defined
        </div>
      </div>
    );
  }

  return (
    <div className="px-2.5 py-1.5 pb-2.5">
      <div className="text-[8.5px] font-bold uppercase tracking-wider text-text-tertiary mb-[5px]">
        {t('viewer.properties.materialLayers')} — {t('viewer.properties.area') === 'areal' ? 'oppskrift' : 'recipe'} per {repUnit}
      </div>
      <div className="flex flex-col gap-px border border-border rounded overflow-hidden">
        {materials.map((mat, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-[5px] px-[7px] py-1 text-[10px]',
              i % 2 === 0 ? 'bg-card' : 'bg-surface-hover',
            )}
          >
            <div
              className="w-[3px] rounded-full self-stretch min-h-4"
              style={{ background: MATERIAL_COLORS[i % MATERIAL_COLORS.length] }}
            />
            <span className="flex-1 text-text-primary font-medium">{mat.name}</span>
            {mat.qtyPerUnit != null && mat.materialUnit && (
              <span className="text-[9px] text-text-tertiary tabular-nums whitespace-nowrap">
                {mat.qtyPerUnit} {mat.materialUnit}/{repUnit}
              </span>
            )}
            {mat.thickness != null && (
              <span className="text-text-secondary tabular-nums text-[9.5px] whitespace-nowrap">
                {mat.thickness} mm
              </span>
            )}
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                mat.hasEpd ? 'bg-[var(--tl-green-dot)]' : 'bg-[var(--tl-red-dot)]',
              )}
              title={mat.hasEpd ? t('viewer.properties.epdLinked') : t('viewer.properties.epdMissing')}
            />
          </div>
        ))}
      </div>

      {/* Total thickness */}
      {totalThickness > 0 && (
        <div className="flex justify-between px-[7px] py-1 text-[10px] font-semibold bg-surface-muted text-text-primary border border-border border-t-0 rounded-b">
          <span>{t('viewer.properties.total')}</span>
          <span>{totalThickness} mm</span>
        </div>
      )}

      {/* EPD legend */}
      <div className="flex items-center gap-2 px-[3px] pt-1 text-[8px] text-text-tertiary">
        <span className="flex items-center gap-[3px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--tl-green-dot)]" />
          {t('viewer.properties.epdLinked')}
        </span>
        <span className="flex items-center gap-[3px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--tl-red-dot)]" />
          {t('viewer.properties.epdMissing')}
        </span>
        <span className="ml-auto">
          {t('viewer.properties.epdCoverage', { linked: epdLinked, total: materials.length })}
        </span>
      </div>
    </div>
  );
}

// ── Discrete Product Card ──

function DiscreteProductCard({ element }: { element: ElementProperties }) {
  const { t } = useTranslation();
  const info = element.productInfo;

  // Show count even without product info
  const count = info?.count ?? (element as any).instanceCount;

  return (
    <div className="px-2.5 py-1.5 pb-2.5">
      {/* Count as headline quantity */}
      {count != null && (
        <div className="flex gap-px bg-black/[0.03] border-b border-black/[0.04] mb-2 rounded overflow-hidden">
          <div className="flex-1 px-1.5 py-[6px] bg-[var(--primary-light)] text-center">
            <div className="text-[14px] font-bold tabular-nums text-[var(--primary)]">
              {count}
            </div>
            <div className="text-[8px] uppercase tracking-wide mt-px text-[var(--primary)] opacity-70">
              stk {t('viewer.properties.count')}
            </div>
          </div>
        </div>
      )}

      <div className="text-[8.5px] font-bold uppercase tracking-wider text-text-tertiary mb-[5px]">
        {t('viewer.properties.productInfo')}
      </div>

      {info ? (
        <div className="border border-border rounded overflow-hidden">
          {info.manufacturer && (
            <ProductRow label={t('viewer.properties.manufacturer')} value={info.manufacturer} />
          )}
          {info.product && (
            <ProductRow label={t('viewer.properties.product')} value={info.product} />
          )}
          {info.articleNumber && (
            <ProductRow label={t('viewer.properties.articleNo')} value={info.articleNumber} />
          )}

          {/* Links */}
          {(info.epdUrl || info.datasheetUrl || info.fdvUrl) && (
            <div className="flex gap-1 px-[7px] py-[5px] border-t border-border bg-surface-muted">
              {info.epdUrl && (
                <ProductLink href={info.epdUrl} label="EPD" icon={<Check className="w-2 h-2" />} />
              )}
              {info.datasheetUrl && (
                <ProductLink href={info.datasheetUrl} label={t('viewer.properties.datasheet')} icon={<FileText className="w-2 h-2" />} />
              )}
              {info.fdvUrl && (
                <ProductLink href={info.fdvUrl} label={t('viewer.properties.fdv')} icon={<ExternalLink className="w-2 h-2" />} />
              )}
            </div>
          )}

          {/* EPD status if no links */}
          {!info.epdUrl && !info.datasheetUrl && !info.fdvUrl && (
            <div className="flex items-center gap-[3px] px-[7px] py-[5px] border-t border-border bg-surface-muted text-[9px] text-text-tertiary">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                info.hasEpd ? 'bg-[var(--tl-green-dot)]' : 'bg-[var(--tl-red-dot)]',
              )} />
              {info.hasEpd ? t('viewer.properties.epdLinked') : t('viewer.properties.epdMissing')}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-text-tertiary italic">
          {t('viewer.selectType')}
        </div>
      )}

      {/* Psets still available for discrete elements */}
      <PsetDropdown element={element} />
    </div>
  );
}

function ProductRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-[5px] px-[7px] py-1 text-[10px] border-b border-black/[0.03] last:border-b-0">
      <span className="text-text-tertiary min-w-[70px]">{label}</span>
      <span className="flex-1 text-text-primary font-medium">{value}</span>
    </div>
  );
}

function ProductLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-[3px] text-[9px] font-semibold bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all no-underline"
    >
      {icon}
      {label}
    </a>
  );
}

// ── Shared SVG ──

function ChevronSvg() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ── Panel header with optional close button ──

function PanelHeader({
  title,
  onClose,
  ifcBadge = false,
}: {
  title: string;
  onClose?: () => void;
  ifcBadge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-[7px] border-b border-border bg-surface-muted flex-shrink-0">
      <h3 className="text-[11px] font-bold text-text-primary">{title}</h3>
      <div className="flex items-center gap-1.5">
        {ifcBadge && (
          <span className="text-[8px] font-semibold uppercase tracking-wide px-[5px] py-px rounded-[3px] bg-surface-muted text-text-tertiary border border-border">
            IFC 4
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Aggregate (multi-select) summary ──

function AggregateSummary({
  aggregate,
  onClose,
  className,
}: {
  aggregate: ElementProperties[];
  onClose?: () => void;
  className?: string;
}) {
  // Type breakdown
  const byType = new Map<string, number>();
  for (const e of aggregate) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }
  const typeRows = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);

  // Summed quantities (only sum compatible quantities)
  const sumNum = (k: keyof ElementProperties): number =>
    aggregate.reduce((s, e) => s + (typeof e[k] === 'number' ? (e[k] as number) : 0), 0);
  const totalArea = sumNum('area');
  const totalVolume = sumNum('volume');
  const totalLength = sumNum('length');

  return (
    <div className={cn('bg-card border-l border-border flex flex-col overflow-hidden', className)}>
      <PanelHeader title={`${aggregate.length} elements selected`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {/* Type breakdown */}
        <section>
          <h4 className="text-[9px] font-semibold uppercase tracking-wide text-text-tertiary mb-1.5">
            Types
          </h4>
          <div className="space-y-0.5">
            {typeRows.map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between px-2 py-1 rounded text-[10px] bg-surface-muted/40"
              >
                <span className="truncate text-text-primary">{type.replace('Ifc', '')}</span>
                <span className="tabular-nums text-text-secondary font-medium">{count}</span>
              </div>
            ))}
          </div>
        </section>
        {/* Summed quantities */}
        {(totalArea > 0 || totalVolume > 0 || totalLength > 0) && (
          <section>
            <h4 className="text-[9px] font-semibold uppercase tracking-wide text-text-tertiary mb-1.5">
              Totals
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {totalArea > 0 && <Stat label="Area" value={totalArea.toFixed(1)} unit="m²" />}
              {totalVolume > 0 && <Stat label="Volume" value={totalVolume.toFixed(2)} unit="m³" />}
              {totalLength > 0 && <Stat label="Length" value={totalLength.toFixed(1)} unit="m" />}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-surface-muted/60 border border-border rounded px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="text-xs font-bold text-text-primary tabular-nums">
        {value} <span className="text-[9px] font-normal text-text-secondary">{unit}</span>
      </div>
    </div>
  );
}
