import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'proj4leaflet';

/**
 * Kartverket WMTS basemap rendered natively in the project CRS — not
 * Web Mercator. Path 3 from the user's preferred-order list
 * (Kartverket → vector OSM → reprojected raster OSM).
 *
 * Why native CRS: BIM project coordinates are in the project's chosen
 * CRS (EUREF89/NTM or UTM). Showing the basemap in that CRS keeps the
 * mental model coherent — what you see is what you commit. Web
 * Mercator would visually distort and disagree with the basepoint
 * E/N readout.
 *
 * Default: EUREF89 / UTM33N (EPSG:25833) — covers central Norway and
 * is Kartverket's most-broadly-served WMTS tile matrix set. When the
 * BEP CRS picker lands, this will switch per project: UTM32N for
 * sør-Norge, UTM35N for Finnmark, NTM zones for detail work.
 *
 * Markers accept WGS84 lat/lon; proj4leaflet projects them to the
 * configured CRS for display automatically.
 *
 * Caching architecture (per user 2026-05-12): the basemap is NOT live.
 * Project basepoint is set once during EIR/BEP authoring, then the map
 * area gets cached. Subsequent loads serve from cache; lazy refreshes
 * via cron overnight. Today this component still hits Kartverket
 * directly — the cache layer is a follow-up.
 */

const UTM33N_RESOLUTIONS = [
  21664, 10832, 5416, 2708, 1354, 677, 338.5, 169.25, 84.625, 42.3125,
  21.15625, 10.578125, 5.2890625, 2.64453125, 1.322265625, 0.6611328125,
  0.33056640625, 0.165283203125, 0.0826416015625,
];
const UTM33N_ORIGIN: [number, number] = [-2500000, 9045984];
const UTM33N_PROJ_DEF =
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

type ProjLeaflet = typeof L & {
  Proj: {
    CRS: new (
      code: string,
      proj4def: string,
      options: { resolutions: number[]; origin: [number, number] }
    ) => L.CRS;
  };
};

const utm33nCrs = new (L as ProjLeaflet).Proj.CRS(
  'EPSG:25833',
  UTM33N_PROJ_DEF,
  { resolutions: UTM33N_RESOLUTIONS, origin: UTM33N_ORIGIN }
);

export interface MapMarker {
  id: string;
  /** WGS84 lat/lon. Caller converts from project CRS via proj4 if needed. */
  lat: number;
  lon: number;
  label: string;
  /** Drives the marker color. */
  kind: 'site' | 'basepoint' | 'control';
}

const MARKER_COLORS: Record<MapMarker['kind'], string> = {
  site: '#157954', // sprucelab green
  basepoint: '#D0D34D', // sprucelab yellow-green
  control: '#21263A', // sprucelab dark
};

function makeIcon(kind: MapMarker['kind'], label: string): L.DivIcon {
  return L.divIcon({
    className: 'kartverket-marker',
    html: `
      <div style="position: relative; transform: translate(-50%, -100%);">
        <div style="
          width: 14px; height: 14px; border-radius: 50%;
          background: ${MARKER_COLORS[kind]};
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          margin-bottom: 2px;
        "></div>
        <div style="
          position: absolute; top: -6px; left: 18px;
          background: white; color: #21263A;
          padding: 1px 5px; border-radius: 3px;
          font-size: 10px; font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        ">${label}</div>
      </div>
    `,
    iconSize: [14, 14],
  });
}

interface KartverketMapProps {
  markers: MapMarker[];
  /** When set, fit-to-this-bounds on update. */
  focus?: MapMarker | null;
  className?: string;
}

export function KartverketMap({
  markers,
  focus,
  className,
}: KartverketMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      crs: utm33nCrs,
      center: [65.0, 13.0],
      zoom: 4,
      attributionControl: true,
      zoomControl: true,
    });

    L.tileLayer(
      'https://cache.kartverket.no/v1/service?Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&Layer=topo&Style=default&TileMatrixSet=utm33n&TileMatrix={z}&TileCol={x}&TileRow={y}',
      {
        attribution: '© Kartverket',
        maxZoom: 18,
        minZoom: 0,
      }
    ).addTo(map);

    const layer = L.layerGroup().addTo(map);
    markerLayerRef.current = layer;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  // Re-render markers when the input array changes
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const m of markers) {
      L.marker([m.lat, m.lon], { icon: makeIcon(m.kind, m.label) }).addTo(
        layer
      );
    }
  }, [markers]);

  // Optionally fly to a focus marker
  useEffect(() => {
    if (!mapRef.current || !focus) return;
    mapRef.current.flyTo([focus.lat, focus.lon], 15, { duration: 0.5 });
  }, [focus]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      ref={containerRef}
      className={
        className ??
        'w-full h-full rounded-md overflow-hidden border border-border/60 bg-muted'
      }
    />
  );
}
