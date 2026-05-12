import { useMemo, useState } from 'react';
import proj4 from 'proj4';
import { Box, FileText, Map as MapIcon, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { KartverketMap, type MapMarker } from './KartverketMap';
import { EirIfcCubePreview } from './EirIfcCubePreview';
import { EirRuleViewRenderer } from './EirRuleViewRenderer';
import { EirIdsXmlPreview } from './EirIdsXmlPreview';
import type { ActiveEirRule } from './eirRules';
import type { AddressValue } from './eirConfig';

/**
 * Right-column preview panel for the EIR builder.
 *
 * Four tabs:
 *  - **Document**: full EIR render (what gets exported to PDF)
 *  - **Map**: Kartverket basemap with markers from site_plan +
 *             placement rules
 *  - **3D**: stylised IFC cube reflecting the current rule config
 *  - **IDS XML**: placeholder buildingSMART IDS export (stub —
 *                 backend export lands in Phase 7)
 *
 * Visible at `lg+`. Below `lg`, the page collapses the panel to a
 * floating "Preview" button (handled by the page-level layout).
 */

// Default to EUREF89/UTM33N for the conversion. When the BEP CRS picker
// lands, swap to the actual project CRS picked there.
proj4.defs(
  'EPSG:25833',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);

function projectCrsToWgs84(
  e: number,
  n: number
): { lat: number; lon: number } | null {
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  if (e === 0 && n === 0) return null;
  try {
    const [lon, lat] = proj4('EPSG:25833', 'EPSG:4326', [e, n]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

interface DerivedState {
  markers: MapMarker[];
  focus: MapMarker | null;
}

function deriveMapState(rules: ActiveEirRule[]): DerivedState {
  const markers: MapMarker[] = [];
  let focus: MapMarker | null = null;

  const sitePlan = rules.find((r) => r.kind === 'site_plan');
  const addr = sitePlan?.config.address as AddressValue | undefined;
  if (
    addr &&
    typeof addr === 'object' &&
    'lat' in addr &&
    'lon' in addr &&
    typeof addr.lat === 'number' &&
    typeof addr.lon === 'number'
  ) {
    const m: MapMarker = {
      id: `site-${sitePlan!.id}`,
      lat: addr.lat,
      lon: addr.lon,
      label: 'Site',
      kind: 'site',
    };
    markers.push(m);
    focus = m;
  }

  const placement = rules.find((r) => r.kind === 'placement');
  if (placement) {
    const bE = placement.config.basepoint_e as number | undefined;
    const bN = placement.config.basepoint_n as number | undefined;
    if (typeof bE === 'number' && typeof bN === 'number') {
      const c = projectCrsToWgs84(bE, bN);
      if (c) {
        const m: MapMarker = {
          id: `basepoint-${placement.id}`,
          lat: c.lat,
          lon: c.lon,
          label: 'Basepoint',
          kind: 'basepoint',
        };
        markers.push(m);
        focus = m;
      }
    }
    if (placement.config.control_point_enabled) {
      const cE = placement.config.control_point_e as number | undefined;
      const cN = placement.config.control_point_n as number | undefined;
      if (typeof cE === 'number' && typeof cN === 'number') {
        const c = projectCrsToWgs84(cE, cN);
        if (c) {
          markers.push({
            id: `control-${placement.id}`,
            lat: c.lat,
            lon: c.lon,
            label: 'Control',
            kind: 'control',
          });
        }
      }
    }
  }

  return { markers, focus };
}

type PreviewTab = 'document' | 'map' | 'cube' | 'ids';

interface EirPreviewPanelProps {
  rules: ActiveEirRule[];
  /** Optional class merged onto the root — caller decides sticky / sizing. */
  className?: string;
  /** Default tab on mount. */
  defaultTab?: PreviewTab;
}

export function EirPreviewPanel({
  rules,
  className,
  defaultTab = 'document',
}: EirPreviewPanelProps) {
  const { t } = useTranslation();
  const { markers, focus } = useMemo(() => deriveMapState(rules), [rules]);
  const [tab, setTab] = useState<PreviewTab>(defaultTab);

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden',
        className
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as PreviewTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList
          className={cn(
            'h-auto w-full justify-start gap-0 rounded-none rounded-t-lg bg-muted/30 p-1 shrink-0'
          )}
        >
          <PreviewTabTrigger
            value="document"
            label={t('eirBuilder.preview.tabDocument', { defaultValue: 'Document' })}
            Icon={FileText}
          />
          <PreviewTabTrigger
            value="map"
            label={t('eirBuilder.preview.tabMap', { defaultValue: 'Map' })}
            Icon={MapIcon}
            badge={markers.length > 0 ? markers.length : undefined}
          />
          <PreviewTabTrigger
            value="cube"
            label={t('eirBuilder.preview.tab3d', { defaultValue: '3D' })}
            Icon={Box}
          />
          <PreviewTabTrigger
            value="ids"
            label={t('eirBuilder.preview.tabIds', { defaultValue: 'IDS XML' })}
            Icon={Code2}
          />
        </TabsList>

        <TabsContent
          value="document"
          className="flex-1 min-h-0 mt-0 overflow-y-auto p-[clamp(0.625rem,1vw,1rem)]"
        >
          {rules.length === 0 ? (
            <p className="text-[clamp(0.6rem,0.75vw,0.8rem)] text-muted-foreground italic px-2 py-3">
              {t('eirBuilder.preview.docEmpty', {
                defaultValue: 'Add rules to see the EIR document take shape.',
              })}
            </p>
          ) : (
            <EirRuleViewRenderer rules={rules} />
          )}
        </TabsContent>

        <TabsContent
          value="map"
          className="flex-1 min-h-0 mt-0 overflow-hidden"
        >
          <div className="h-full min-h-[clamp(14rem,30vh,22rem)]">
            <KartverketMap markers={markers} focus={focus} />
          </div>
        </TabsContent>

        <TabsContent
          value="cube"
          className="flex-1 min-h-0 mt-0 overflow-hidden"
        >
          <div className="h-full min-h-[clamp(14rem,30vh,22rem)] relative bg-muted/10">
            <EirIfcCubePreview rules={rules} />
          </div>
        </TabsContent>

        <TabsContent
          value="ids"
          className="flex-1 min-h-0 mt-0 overflow-hidden flex flex-col"
        >
          <EirIdsXmlPreview rules={rules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewTabTrigger({
  value,
  label,
  Icon,
  badge,
}: {
  value: PreviewTab;
  label: string;
  Icon: typeof FileText;
  badge?: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-[clamp(0.5rem,0.8vw,0.75rem)] py-[clamp(0.25rem,0.4vh,0.4rem)] text-[clamp(0.6rem,0.75vw,0.8rem)] font-medium'
      )}
    >
      <Icon className="h-[clamp(0.7rem,0.85vw,0.85rem)] w-[clamp(0.7rem,0.85vw,0.85rem)]" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[clamp(0.45rem,0.6vw,0.65rem)] tabular-nums font-semibold bg-primary/15 text-primary rounded-full px-1.5">
          {badge}
        </span>
      )}
    </TabsTrigger>
  );
}
