/**
 * Element Properties Panel
 *
 * Displays IFC element properties organized for BIM coordinator workflows:
 * - Validation: Identity, Classification, Specifications
 * - Quantity Takeoff: Dimensions, Areas, Volumes
 * - Material Ordering: Materials, Layers, Warehouse links
 */

import { Copy, Check, ChevronDown, Box } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

// ============================================================================
// Types
// ============================================================================

export interface ElementProperties {
  // Core identity
  expressID: number;
  type: string;
  predefinedType?: string;
  objectType?: string;
  name?: string;
  guid?: string;
  description?: string;

  // Model reference
  modelId?: string;
  modelName?: string;

  // Location (resolved names)
  site?: string;
  building?: string;
  storey?: string;
  space?: string;
  system?: string;

  // Quantities (from entity fields)
  area?: number;
  volume?: number;
  length?: number;
  height?: number;
  width?: number;
  perimeter?: number;

  // Materials
  materials?: Array<{
    name: string;
    category?: string;
    thickness?: number;
  }>;

  // Classification
  ns3451Code?: string;
  classificationReference?: string;

  // Property sets (raw)
  psets?: Record<string, Record<string, any>>;

  // Allow additional properties
  [key: string]: any;
}

interface ElementPropertiesPanelProps {
  element: ElementProperties | null;
  onClose?: () => void;
  className?: string;
}

// ============================================================================
// Property categorization
// ============================================================================

// Common specification properties to extract from Pset_*Common
const SPEC_PROPERTIES = [
  'FireRating',
  'IsExternal',
  'LoadBearing',
  'ThermalTransmittance',
  'AcousticRating',
  'Reference',
  'Status',
  'IsExternal',
  'Combustible',
  'SurfaceSpreadOfFlame',
];

// ============================================================================
// Utility functions
// ============================================================================

function formatQuantity(value: number | undefined | null, unit: string): string {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function formatBoolean(value: any): string {
  if (value === true || value === 'true' || value === 'True') return 'Yes';
  if (value === false || value === 'false' || value === 'False') return 'No';
  return String(value);
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Extract specifications from psets
function extractSpecifications(psets?: Record<string, Record<string, any>>): Record<string, any> {
  const specs: Record<string, any> = {};
  if (!psets) return specs;

  Object.entries(psets).forEach(([psetName, props]) => {
    if (psetName.includes('Common') || psetName.startsWith('Pset_')) {
      Object.entries(props).forEach(([propName, propValue]) => {
        if (SPEC_PROPERTIES.includes(propName) && !specs[propName]) {
          specs[propName] = propValue;
        }
      });
    }
  });

  return specs;
}

// Extract quantities from psets (Qto_*)
function extractQuantitiesFromPsets(psets?: Record<string, Record<string, any>>): Record<string, any> {
  const quantities: Record<string, any> = {};
  if (!psets) return quantities;

  Object.entries(psets).forEach(([psetName, props]) => {
    if (psetName.startsWith('Qto_')) {
      Object.entries(props).forEach(([propName, propValue]) => {
        if (!quantities[propName]) {
          quantities[propName] = propValue;
        }
      });
    }
  });

  return quantities;
}

// ============================================================================
// Sub-components
// ============================================================================

function PropertyRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-xs">
      <span className="text-text-tertiary shrink-0">{label}</span>
      <span className={cn('text-text-primary text-right', mono && 'font-mono text-[10px]')}>
        {formatValue(value)}
      </span>
    </div>
  );
}

function CopyableGuid({ guid }: { guid: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(guid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[10px] text-text-secondary truncate">{guid}</span>
      <button
        onClick={handleCopy}
        className="p-1 hover:bg-surface-hover rounded transition-colors"
        title="Copy GUID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 text-text-tertiary" />
        )}
      </button>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-border last:border-b-0">
      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors list-none">
        <span className="text-xs font-medium text-text-primary">{title}</span>
        <div className="flex items-center gap-2">
          {badge !== undefined && (
            <span className="text-[10px] text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-text-tertiary transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="px-3 pb-3">
        {children}
      </div>
    </details>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ElementPropertiesPanel({ element, onClose: _onClose, className }: ElementPropertiesPanelProps) {
  // Note: onClose is available for parent components to handle closing via prop drilling
  // Currently the panel manages its own display state via the element prop
  if (!element) {
    return (
      <Card className={cn('p-3', className)}>
        <div className="flex items-center gap-2 mb-2">
          <Box className="h-4 w-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-primary">Element Properties</h3>
        </div>
        <p className="text-xs text-text-tertiary py-2">
          Select an element to view properties
        </p>
      </Card>
    );
  }

  // Extract data from psets
  const specifications = extractSpecifications(element.psets);
  const qtoQuantities = extractQuantitiesFromPsets(element.psets);

  // Combine quantities from entity fields and Qto psets
  const hasQuantities = element.area || element.volume || element.length ||
    element.height || element.width || element.perimeter ||
    Object.keys(qtoQuantities).length > 0;

  const hasSpecifications = Object.keys(specifications).length > 0;
  const hasMaterials = element.materials && element.materials.length > 0;

  // Count all properties for badge
  const allPsetCount = element.psets ? Object.keys(element.psets).length : 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header - Identity (Always visible) */}
      <div className="px-3 py-3 border-b border-border bg-surface-hover/50">
        <div className="flex items-center gap-2 mb-2">
          <Box className="h-4 w-4 text-text-secondary" />
          <h3 className="text-xs font-semibold text-text-primary">Element Properties</h3>
        </div>

        {/* IFC Type - Prominent */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary">{element.type}</div>
            {element.name && (
              <div className="text-xs text-text-secondary truncate mt-0.5" title={element.name}>
                {element.name}
              </div>
            )}
          </div>
          {element.predefinedType && element.predefinedType !== 'NOTDEFINED' && (
            <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded shrink-0">
              {element.predefinedType}
            </span>
          )}
        </div>

        {/* Object Type if different from name */}
        {element.objectType && element.objectType !== element.name && (
          <div className="text-[10px] text-text-tertiary mt-1 truncate">
            Type: {element.objectType}
          </div>
        )}

        {/* GUID with copy */}
        {element.guid && (
          <div className="mt-2">
            <CopyableGuid guid={element.guid} />
          </div>
        )}

        {/* Model reference */}
        {element.modelName && (
          <div className="text-[10px] text-text-tertiary mt-1">
            Model: {element.modelName}
          </div>
        )}
      </div>

      {/* Scrollable sections */}
      <div className="max-h-[400px] overflow-y-auto">
        {/* Location Section */}
        {(element.site || element.building || element.storey || element.space || element.system) && (
          <Section title="Location" defaultOpen={true}>
            <div className="space-y-0.5">
              {element.site && <PropertyRow label="Site" value={element.site} />}
              {element.building && <PropertyRow label="Building" value={element.building} />}
              {element.storey && <PropertyRow label="Storey" value={element.storey} />}
              {element.space && <PropertyRow label="Space" value={element.space} />}
              {element.system && <PropertyRow label="System" value={element.system} />}
            </div>
          </Section>
        )}

        {/* Quantities Section - For Takeoffs */}
        {hasQuantities && (
          <Section title="Quantities" defaultOpen={true}>
            <div className="space-y-0.5">
              {/* From entity fields */}
              {element.length && <PropertyRow label="Length" value={formatQuantity(element.length, 'm')} />}
              {element.width && <PropertyRow label="Width" value={formatQuantity(element.width, 'm')} />}
              {element.height && <PropertyRow label="Height" value={formatQuantity(element.height, 'm')} />}
              {element.perimeter && <PropertyRow label="Perimeter" value={formatQuantity(element.perimeter, 'm')} />}
              {element.area && <PropertyRow label="Area" value={formatQuantity(element.area, 'm²')} />}
              {element.volume && <PropertyRow label="Volume" value={formatQuantity(element.volume, 'm³')} />}

              {/* From Qto psets */}
              {Object.entries(qtoQuantities).map(([key, value]) => {
                // Determine unit based on property name
                let unit = '';
                if (key.toLowerCase().includes('area')) unit = 'm²';
                else if (key.toLowerCase().includes('volume')) unit = 'm³';
                else if (key.toLowerCase().includes('length') || key.toLowerCase().includes('height') ||
                         key.toLowerCase().includes('width') || key.toLowerCase().includes('depth') ||
                         key.toLowerCase().includes('perimeter') || key.toLowerCase().includes('thickness')) unit = 'm';
                else if (key.toLowerCase().includes('weight')) unit = 'kg';

                return (
                  <PropertyRow
                    key={key}
                    label={key.replace(/([A-Z])/g, ' $1').trim()}
                    value={typeof value === 'number' ? formatQuantity(value, unit) : formatValue(value)}
                  />
                );
              })}
            </div>
          </Section>
        )}

        {/* Materials Section - For Ordering */}
        {hasMaterials && (
          <Section title="Materials" defaultOpen={true} badge={element.materials!.length}>
            <div className="space-y-2">
              {element.materials!.map((mat, idx) => (
                <div key={idx} className="text-xs">
                  <div className="font-medium text-text-primary">{mat.name}</div>
                  {mat.category && (
                    <div className="text-text-tertiary">{mat.category}</div>
                  )}
                  {mat.thickness && (
                    <div className="text-text-tertiary">{mat.thickness} mm</div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Specifications Section - Common Properties */}
        {hasSpecifications && (
          <Section title="Specifications" defaultOpen={true}>
            <div className="space-y-0.5">
              {Object.entries(specifications).map(([key, value]) => (
                <PropertyRow
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1').trim()}
                  value={typeof value === 'boolean' || value === 'true' || value === 'false'
                    ? formatBoolean(value)
                    : formatValue(value)
                  }
                />
              ))}
            </div>
          </Section>
        )}

        {/* Classification Section */}
        {(element.ns3451Code || element.classificationReference) && (
          <Section title="Classification" defaultOpen={true}>
            <div className="space-y-0.5">
              {element.ns3451Code && <PropertyRow label="NS-3451" value={element.ns3451Code} />}
              {element.classificationReference && (
                <PropertyRow label="Reference" value={element.classificationReference} />
              )}
            </div>
          </Section>
        )}

        {/* All Property Sets - For Power Users */}
        {allPsetCount > 0 && (
          <Section title="All Property Sets" defaultOpen={false} badge={allPsetCount}>
            <div className="space-y-3">
              {Object.entries(element.psets!).map(([psetName, props]) => (
                <div key={psetName}>
                  <div className="text-[10px] font-medium text-text-secondary mb-1 uppercase tracking-wide">
                    {psetName.replace('Pset_', '').replace('Qto_', 'Qto: ')}
                  </div>
                  <div className="space-y-0.5 pl-2 border-l border-border">
                    {Object.entries(props).map(([propName, propValue]) => (
                      <PropertyRow key={propName} label={propName} value={propValue} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Express ID - Technical reference at bottom */}
        <div className="px-3 py-2 border-t border-border">
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>Express ID</span>
            <span className="font-mono">{element.expressID}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
