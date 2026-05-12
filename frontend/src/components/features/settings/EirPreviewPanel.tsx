import { useMemo } from 'react';
import proj4 from 'proj4';
import { Map as MapIcon, Box, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { KartverketMap, type MapMarker } from './KartverketMap';
import { EirIfcCubePreview } from './EirIfcCubePreview';
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

interface EirPreviewPanelProps {
  rules: ActiveEirRule[];
}

/**
 * Right-column preview widgets, dashboard-style. Two stacked cards
 * (map + IFC) with intrinsic proportions — they do NOT stretch to fill
 * viewport height. Right column scrolls naturally if cards overflow.
 */
export function EirPreviewPanel({ rules }: EirPreviewPanelProps) {
  const { t } = useTranslation();
  const { markers, focus } = useMemo(() => deriveMapState(rules), [rules]);

  return (
    <div className="flex flex-col gap-[clamp(0.625rem,1vh,1rem)] overflow-y-auto pr-[clamp(0.125rem,0.25vw,0.25rem)] pb-[clamp(1rem,2vh,2rem)]">
      <PreviewWidget
        icon={MapIcon}
        title={t('settings.eir.tabMap', { defaultValue: 'Map' })}
        count={markers.length}
        bodyClassName="aspect-square"
      >
        <KartverketMap markers={markers} focus={focus} />
      </PreviewWidget>

      <PreviewWidget
        icon={Box}
        title={t('settings.eir.tabIfc', { defaultValue: 'Sample IFC' })}
        bodyClassName=""
      >
        {/*
         * Side-by-side: 3D cube preview on the left, structured metadata
         * tree on the right. Stacks vertically below ~lg so the right
         * column stays usable in narrower viewports.
         */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[clamp(0.375rem,0.6vw,0.625rem)] p-[clamp(0.375rem,0.6vw,0.625rem)]">
          <div className="rounded-md border border-border/40 bg-muted/20 aspect-square min-h-[clamp(8rem,16vw,12rem)] relative overflow-hidden">
            <EirIfcCubePreview rules={rules} />
          </div>
          <div className="rounded-md border border-border/40 bg-card/40 max-h-[clamp(16rem,32vh,22rem)] overflow-y-auto">
            <IfcCubePreview rules={rules} />
          </div>
        </div>
      </PreviewWidget>
    </div>
  );
}

function PreviewWidget({
  icon: Icon,
  title,
  count,
  bodyClassName,
  children,
}: {
  icon: typeof MapIcon;
  title: string;
  count?: number;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
      <header className="flex items-center gap-1.5 px-[clamp(0.5rem,0.8vw,0.875rem)] py-[clamp(0.375rem,0.6vh,0.625rem)] border-b border-border/40">
        <Icon className="h-[clamp(0.75rem,0.95vw,0.95rem)] w-[clamp(0.75rem,0.95vw,0.95rem)] text-muted-foreground shrink-0" />
        <h3 className="text-[clamp(0.65rem,0.78vw,0.82rem)] font-semibold tracking-tight flex-1 min-w-0">
          {title}
        </h3>
        {count !== undefined && count > 0 && (
          <span className="tabular-nums text-[clamp(0.5rem,0.65vw,0.7rem)] bg-primary/15 text-primary rounded-full px-1.5 font-semibold">
            {count}
          </span>
        )}
      </header>
      <div className={cn('w-full', bodyClassName)}>{children}</div>
    </section>
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
