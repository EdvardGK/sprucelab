import { useState, useEffect, useRef, useCallback } from 'react';
import type { AddressValue } from './eirConfig';

/**
 * Kartverket Geonorge adressesøk hook. Lifted from skiplumXge-react
 * (`use-property-search.ts`) — debounced fuzzy match against the
 * national address registry. Returns AddressValue results in WGS84.
 *
 * Endpoint: https://ws.geonorge.no/adresser/v1/sok
 * Free public API, no key required. Fuzzy=true is forgiving on typos.
 *
 * Includes the stale-response guard pattern (searchId + AbortController)
 * so fast typing doesn't clobber results with a slower earlier response.
 */

const GEONORGE_URL = 'https://ws.geonorge.no/adresser/v1/sok';

interface GeonorgeRaw {
  adressetekst: string;
  adressenavn?: string;
  husnummer?: string;
  postnr?: string;
  poststed?: string;
  kommunenavn?: string;
  kommunenummer?: string;
  gardsnummer?: string;
  bruksnummer?: string;
  representasjonspunkt: { epsg: string; lat: number; lon: number };
}

interface GeonorgeResponse {
  metadata: { totaltAntallTreff: number };
  adresser: GeonorgeRaw[];
}

async function searchGeonorge(
  query: string,
  signal: AbortSignal,
  limit: number
): Promise<AddressValue[]> {
  if (query.trim().length < 3) return [];
  const url = new URL(GEONORGE_URL);
  url.searchParams.set('sok', query);
  url.searchParams.set('fuzzy', 'true');
  url.searchParams.set('treffPerSide', String(limit));
  url.searchParams.set('side', '0');
  url.searchParams.set('utkoordsys', '4326');
  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geonorge ${res.status}`);
  const data: GeonorgeResponse = await res.json();
  return data.adresser.map((a) => ({
    adressetekst: a.adressetekst,
    lat: a.representasjonspunkt.lat,
    lon: a.representasjonspunkt.lon,
    municipality: a.kommunenavn,
    municipalityNumber: a.kommunenummer,
    postalCode: a.postnr,
    postalPlace: a.poststed,
    gardsnummer: a.gardsnummer,
    bruksnummer: a.bruksnummer,
  }));
}

export function useKartverketAddressSearch({
  debounceMs = 200,
  limit = 10,
}: { debounceMs?: number; limit?: number } = {}) {
  const [query, setQueryRaw] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<AddressValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef(0);

  const setQuery = useCallback((q: string) => setQueryRaw(q), []);
  const clear = useCallback(() => {
    setQueryRaw('');
    setResults([]);
    setError(null);
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), debounceMs);
    return () => clearTimeout(id);
  }, [query, debounceMs]);

  useEffect(() => {
    abortRef.current?.abort();
    if (debounced.trim().length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    const myId = ++searchIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setError(null);
    searchGeonorge(debounced, ac.signal, limit)
      .then((addresses) => {
        if (ac.signal.aborted || myId !== searchIdRef.current) return;
        setResults(addresses);
        setIsLoading(false);
      })
      .catch((e) => {
        if (ac.signal.aborted || myId !== searchIdRef.current) return;
        if (e instanceof Error && e.name !== 'AbortError') {
          setError(e.message);
        }
        setResults([]);
        setIsLoading(false);
      });
    return () => ac.abort();
  }, [debounced, limit]);

  return { query, setQuery, results, isLoading, error, clear };
}
