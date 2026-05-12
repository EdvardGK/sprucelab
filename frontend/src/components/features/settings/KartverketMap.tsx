import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'proj4leaflet';
import type { AddressValue } from './eirConfig';

/**
 * Kartverket WMTS basemap rendered natively in the project CRS — not
 * Web Mercator. Implements path 3 from the user's preferred-order list
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
 * Markers accept WGS84 lat/lon (what Geonorge returns); proj4leaflet
 * projects them to UTM33N for display automatically.
 *
 * Caching architecture (per user 2026-05-12): the basemap is NOT live.
 * The project basepoint is set once during EIR/BEP authoring, then the
 * map area gets cached. Subsequent page loads serve from cache; lazy
 * refreshes can run overnight via cron. Today this component still
 * hits Kartverket directly — the cache layer is a follow-up.
 */

// Kartverket UTM33N tile matrix set. Resolutions per matrix level are
// publicly documented in Kartverket's WMTS GetCapabilities response.
const UTM33N_RESOLUTIONS = [
  21664, 10832, 5416, 2708, 1354, 677, 338.5, 169.25, 84.625, 42.3125,
  21.15625, 10.578125, 5.2890625, 2.64453125, 1.322265625, 0.6611328125,
  0.33056640625, 0.165283203125, 0.0826416015625,
];
const UTM33N_ORIGIN: [number, number] = [-2500000, 9045984];
const UTM33N_PROJ_DEF =
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// proj4leaflet attaches its API to `L.Proj` at import time. The bundled
// types don't declare it (just augments L), so we narrow here.
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
  {
    resolutions: UTM33N_RESOLUTIONS,
    origin: UTM33N_ORIGIN,
  }
);

// Marker icons need explicit URLs since bundlers don't copy leaflet's
// asset references through. Pull from the leaflet CDN.
const markerIcon = L.icon({
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface KartverketMapProps {
  address: AddressValue | null;
  className?: string;
}

export function KartverketMap({ address, className }: KartverketMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      crs: utm33nCrs,
      // Norway-ish centroid until an address pins it
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

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Marker follows address
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!address) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const latLng = L.latLng(address.lat, address.lon);
    if (markerRef.current) {
      markerRef.current.setLatLng(latLng);
    } else {
      markerRef.current = L.marker(latLng, { icon: markerIcon }).addTo(map);
    }
    map.flyTo(latLng, 14, { duration: 0.6 });
  }, [address]);

  // Leaflet measures the container at init. If we mount inside a
  // collapsible/popover/flex parent it may be 0×0 initially; call
  // invalidateSize once a frame later.
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
        'w-full h-[clamp(12rem,28vh,18rem)] rounded-md overflow-hidden border border-border/60 bg-muted'
      }
    />
  );
}
