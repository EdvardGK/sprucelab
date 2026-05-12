import { useMemo, useState } from 'react';
import proj4 from 'proj4';
import { Map as MapIcon, Box, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { KartverketMap, type MapMarker } from './KartverketMap';
import type { ActiveEirRule } from './eirRules';
import type { AddressValue } from './eirConfig';

/**
 * Persistent right-side preview panel. Two tabs:
 *  - **Map** — Kartverket basemap with markers derived live from rule
 *    state: site address (from site_plan), basepoint + control point
 *    (from placement, converted from project CRS to WGS84 for display).
 *  - **IFC preview** — a sample IFC-cube property panel that auto-fills
 *    as the EIR rules get configured. Shows the user what a delivered
 *    IFC would carry as metadata.
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

  // Site address marker
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

  // Basepoint + control point (from placement rule, in project CRS)
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

type Tab = 'map' | 'ifc';

interface EirPreviewPanelProps {
  rules: ActiveEirRule[];
}

export function EirPreviewPanel({ rules }: EirPreviewPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('map');
  const { markers, focus } = useMemo(() => deriveMapState(rules), [rules]);

  return (
    <aside className="flex flex-col gap-[clamp(0.375rem,0.6vh,0.625rem)] h-full min-h-0">
      <header className="flex items-center gap-1 px-[clamp(0.25rem,0.4vw,0.5rem)]">
        <h2 className="text-[clamp(0.6rem,0.72vw,0.78rem)] font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          {t('settings.eir.previewTitle', { defaultValue: 'Live preview' })}
        </h2>
      </header>

      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40 self-start">
        <TabButton
          active={tab === 'map'}
          onClick={() => setTab('map')}
          icon={MapIcon}
          label={t('settings.eir.tabMap', { defaultValue: 'Map' })}
          count={markers.length}
        />
        <TabButton
          active={tab === 'ifc'}
          onClick={() => setTab('ifc')}
          icon={Box}
          label={t('settings.eir.tabIfc', { defaultValue: 'IFC' })}
        />
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-border/60 bg-card overflow-hidden">
        {tab === 'map' ? (
          <KartverketMap markers={markers} focus={focus} />
        ) : (
          <IfcCubePreview rules={rules} />
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MapIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-[clamp(0.5rem,0.7vw,0.75rem)] py-[clamp(0.2rem,0.3vh,0.35rem)] rounded text-[clamp(0.6rem,0.72vw,0.78rem)] font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-[clamp(0.625rem,0.85vw,0.85rem)] w-[clamp(0.625rem,0.85vw,0.85rem)]" />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="tabular-nums text-[clamp(0.5rem,0.6vw,0.65rem)] bg-primary/15 text-primary rounded-full px-1.5">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * IFC preview: stylized property-panel tree showing how the EIR rules
 * project into a sample IFC delivery. Not a 3D render (yet) — a
 * scannable structural preview so the user sees the metadata that
 * a delivered IFC will carry. The 3D cube is a follow-up.
 */
function IfcCubePreview({ rules }: { rules: ActiveEirRule[] }) {
  const { t } = useTranslation();

  // Pull live values
  const ifcSchema = rules.find((r) => r.kind === 'ifc_schema');
  const versions = (ifcSchema?.config.versions as string[]) ?? [];
  const mvds = (ifcSchema?.config.mvds as string[]) ?? [];
  const crsRule = rules.find((r) => r.kind === 'crs');
  const hCrs = (crsRule?.config.horizontal_crs as string[]) ?? [];
  const vDatum = (crsRule?.config.vertical_datum as string[]) ?? [];
  const placement = rules.find((r) => r.kind === 'placement');
  const sitePlan = rules.find((r) => r.kind === 'site_plan');
  const addr = sitePlan?.config.address as AddressValue | undefined;
  const naming = rules.find((r) => r.kind === 'naming');
  const classifications = rules.filter((r) => r.kind === 'classification');
  const mmi = rules.find((r) => r.kind === 'mmi_lod');
  const tags = rules.filter((r) => r.kind === 'tagging');
  const customs = rules.filter((r) => r.kind === 'custom_properties');

  return (
    <div className="h-full overflow-y-auto p-[clamp(0.625rem,1vw,1rem)] text-[clamp(0.6rem,0.72vw,0.78rem)] leading-[1.5] font-mono">
      <header className="flex items-center gap-1.5 mb-3 pb-2 border-b border-border/40">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span className="font-sans font-semibold text-[clamp(0.65rem,0.78vw,0.82rem)]">
          {t('settings.eir.ifcPreviewTitle', {
            defaultValue: 'Sample IFC delivery (metadata view)',
          })}
        </span>
      </header>

      <PreviewNode label="IfcProject" indent={0}>
        <PreviewProp k="Name" v={`{${(naming?.config.template_kind as string) ?? 'naming.template_kind'}}`} />
        <PreviewProp
          k="Schema"
          v={versions[0] ?? '—'}
          empty={versions.length === 0}
        />
        <PreviewProp
          k="MVD"
          v={mvds[0] ?? '—'}
          empty={mvds.length === 0}
        />
      </PreviewNode>

      <PreviewNode label="IfcProjectedCRS" indent={1}>
        <PreviewProp
          k="Name"
          v={hCrs[0] ?? '—'}
          empty={hCrs.length === 0}
        />
        <PreviewProp
          k="VerticalDatum"
          v={vDatum[0] ?? '—'}
          empty={vDatum.length === 0}
        />
      </PreviewNode>

      <PreviewNode label="IfcSite" indent={1}>
        <PreviewProp k="Name" v={addr?.adressetekst ?? '—'} empty={!addr} />
        <PreviewProp
          k="RefLatitude"
          v={addr ? addr.lat.toFixed(6) : '—'}
          empty={!addr}
        />
        <PreviewProp
          k="RefLongitude"
          v={addr ? addr.lon.toFixed(6) : '—'}
          empty={!addr}
        />
      </PreviewNode>

      {placement && (
        <PreviewNode label="IfcMapConversion" indent={2}>
          <PreviewProp
            k="Eastings"
            v={(placement.config.basepoint_e as number | undefined)?.toString() ?? '—'}
            empty={!placement.config.basepoint_e}
          />
          <PreviewProp
            k="Northings"
            v={(placement.config.basepoint_n as number | undefined)?.toString() ?? '—'}
            empty={!placement.config.basepoint_n}
          />
          <PreviewProp
            k="OrthogonalHeight"
            v={(placement.config.basepoint_h as number | undefined)?.toString() ?? '—'}
            empty={!placement.config.basepoint_h}
          />
        </PreviewNode>
      )}

      <PreviewNode label="IfcBuilding" indent={1}>
        <PreviewProp k="Name" v="(sample cube)" />
        {classifications.map((c) => (
          <PreviewProp
            key={c.id}
            k={`${(c.config.ifc_pset as string) ?? 'Pset_?'}.${(c.config.ifc_property as string) ?? '?'}`}
            v={`= ${(c.config.system as string) ?? '—'}`}
          />
        ))}
        {mmi && (
          <PreviewProp
            k={`${(mmi.config.ifc_pset as string) ?? 'Pset_?'}.${(mmi.config.ifc_property as string) ?? '?'}`}
            v={`(${(mmi.config.system as string) ?? '—'})`}
          />
        )}
        {tags.map((t) => (
          <PreviewProp
            key={t.id}
            k={`${(t.config.ifc_pset as string) ?? 'Pset_?'}.${(t.config.ifc_property as string) ?? '?'}`}
            v={`(${(t.config.namespace as string) ?? 'tag'})`}
          />
        ))}
        {customs.map((c) => {
          const prefix = (c.config.prefix as string) ?? '';
          const psets = (c.config.pset_names as string) ?? '';
          return (
            <PreviewProp
              key={c.id}
              k={`${prefix}* (custom)`}
              v={psets || '(no Psets yet)'}
              empty={!psets}
            />
          );
        })}
      </PreviewNode>
    </div>
  );
}

function PreviewNode({
  label,
  indent,
  children,
}: {
  label: string;
  indent: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="mb-1.5"
      style={{ paddingLeft: `${indent * 12}px` }}
    >
      <div className="text-foreground font-semibold">{label}</div>
      <div className="ml-3 border-l border-border/40 pl-2">{children}</div>
    </div>
  );
}

function PreviewProp({
  k,
  v,
  empty,
}: {
  k: string;
  v: string;
  empty?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-1.5',
        empty && 'text-muted-foreground/60'
      )}
    >
      <span className="text-muted-foreground/80">{k}</span>
      <span className="text-foreground/80 truncate">{v}</span>
    </div>
  );
}
