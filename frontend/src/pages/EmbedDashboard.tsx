import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import {
  CURRENT_PROTOCOL_VERSION,
  createFilterContext,
  type FilterContext,
} from '@/lib/embed/types';
import {
  createEmbedApiClient,
  type EmbedCapabilitiesResponse,
} from '@/lib/embed/embed-api-client';
import { usePostMessageBus } from '@/lib/embed/messaging';

/**
 * EmbedDashboard — the iframe entry point for the forward-deployed embed
 * surface (PR 4 of the embed track).
 *
 * v1 ships a hardcoded handshake renderer per the plan doc: read the
 * scoped token from the URL, fetch `/api/embed/capabilities/` to learn
 * the project + allowed origins, postMessage `ready`, then echo every
 * `set_filter` from the host as a JSON pretty-print so an external
 * developer can verify the bus end-to-end. Real dashboards (Requirements
 * Fulfillment, Floors Overview, Type Browser tile) land in PRs 8–10.
 */
export default function EmbedDashboard() {
  const { dashboard } = useParams<{ dashboard: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const apiClient = useMemo(
    () => (token ? createEmbedApiClient(token) : null),
    [token],
  );

  const [capabilities, setCapabilities] = useState<EmbedCapabilitiesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterContext | null>(null);
  const [readySent, setReadySent] = useState(false);

  // Fetch capabilities to learn project_id + allowed_origins.
  useEffect(() => {
    if (!apiClient) {
      setLoadError('missing_token');
      return;
    }
    let cancelled = false;
    apiClient
      .get<EmbedCapabilitiesResponse>('/embed/capabilities/')
      .then(({ data }) => {
        if (cancelled) return;
        setCapabilities(data);
        setFilter(createFilterContext({ project_id: data.token.project_id }));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.response?.status === 401 ? 'token_rejected' : 'capabilities_failed');
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const allowedOrigins = capabilities?.token.allowed_origins ?? [];

  const handleHostMessage = useCallback(
    (msg: { kind: 'set_filter' | 'request_height'; protocol_version: number; payload?: Partial<FilterContext> }) => {
      if (msg.kind === 'set_filter') {
        setFilter((prev) => {
          if (!prev) return prev;
          const merged: FilterContext = { ...prev, ...(msg.payload ?? {}), protocol_version: CURRENT_PROTOCOL_VERSION };
          return merged;
        });
      }
      // request_height is acknowledged in the height-emit effect below.
    },
    [],
  );

  const bus = usePostMessageBus({
    allowedOrigins,
    onMessage: handleHostMessage,
    onWarn:
      import.meta.env.DEV
        ? (reason, detail) => console.warn(`[embed] ${reason}`, detail)
        : undefined,
  });

  // Send the initial `ready` once capabilities arrive.
  useEffect(() => {
    if (!capabilities || readySent) return;
    bus.send({
      kind: 'ready',
      protocol_versions: [CURRENT_PROTOCOL_VERSION],
    });
    setReadySent(true);
  }, [capabilities, readySent, bus]);

  // Echo filter changes back to the host so the bus is provably round-trip.
  useEffect(() => {
    if (!filter || !readySent) return;
    bus.send({
      kind: 'filter_changed',
      protocol_version: CURRENT_PROTOCOL_VERSION,
      payload: filter,
    });
  }, [filter, readySent, bus]);

  // Surface fatal load failures to the host as `error` events.
  useEffect(() => {
    if (!loadError) return;
    bus.send({
      kind: 'error',
      protocol_version: CURRENT_PROTOCOL_VERSION,
      payload: {
        code: loadError,
        message:
          loadError === 'missing_token'
            ? 'Embed iframe loaded without ?token=… in the URL.'
            : loadError === 'token_rejected'
              ? 'Embed token rejected by the API. It may be expired or revoked.'
              : 'Failed to load embed capabilities.',
        recoverable: loadError !== 'missing_token',
      },
    });
  }, [loadError, bus]);

  if (loadError) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Embed unavailable</h1>
        <p style={bodyStyle}>{loadError === 'missing_token' ? 'No token in URL.' : loadError}</p>
      </div>
    );
  }

  if (!capabilities || !filter) {
    return (
      <div style={containerStyle}>
        <p style={bodyStyle}>Loading embed…</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <header style={{ marginBottom: 24 }}>
        <div style={metaRowStyle}>
          <span style={badgeStyle}>{dashboard ?? 'handshake'}</span>
          <span style={metaTextStyle}>protocol v{capabilities.protocol_version}</span>
          <span style={metaTextStyle}>
            project {capabilities.token.project_id.slice(0, 8)}…
          </span>
          {bus.parentOrigin() ? (
            <span style={metaTextStyle}>parent {bus.parentOrigin()}</span>
          ) : (
            <span style={{ ...metaTextStyle, opacity: 0.5 }}>awaiting handshake…</span>
          )}
        </div>
      </header>
      <main>
        <h2 style={titleStyle}>Filter context</h2>
        <pre style={preStyle}>{JSON.stringify(filter, null, 2)}</pre>
        <p style={hintStyle}>
          Send a <code>set_filter</code> message from the host to update this view.
        </p>
      </main>
    </div>
  );
}

// Inline styles keep the embed page free of route-level CSS imports.
// The page is a single-purpose handshake harness; full design comes in
// PRs 8–10 when the real dashboards ship.
const containerStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: 24,
  minHeight: '100vh',
  background: '#0b0d10',
  color: '#e5e7eb',
  boxSizing: 'border-box',
};
const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  opacity: 0.7,
  margin: 0,
};
const bodyStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.5 };
const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  fontSize: 12,
  flexWrap: 'wrap',
};
const badgeStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  background: '#1f2937',
  color: '#93c5fd',
  fontWeight: 500,
};
const metaTextStyle: React.CSSProperties = { opacity: 0.8 };
const preStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 13,
  padding: 16,
  background: '#111827',
  color: '#f3f4f6',
  borderRadius: 6,
  overflow: 'auto',
  marginTop: 8,
};
const hintStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 12,
  opacity: 0.6,
};
