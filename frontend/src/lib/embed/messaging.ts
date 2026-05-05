import { useCallback, useEffect, useRef } from 'react';

import { CURRENT_PROTOCOL_VERSION, type EmbedHandshake } from './types';

/**
 * postMessage bus used by the embed iframe page.
 *
 * Three responsibilities:
 *   1. Allow-list parent origins (token-driven). Messages from elsewhere are
 *      dropped silently — no leak, no acknowledgement.
 *   2. Validate the protocol version on every inbound message; mismatches
 *      emit an `error` upstream and ignore.
 *   3. Send messages to the validated parent origin once known. The first
 *      `ready` is the only outbound message addressed to `*`; everything
 *      after is targeted to the origin we observed an inbound message from.
 *
 * Defense in depth: the JS-level origin filter is the only enforcement
 * layer we control on the embed side — the resolver/token check on the
 * Django side scopes data, but if a hostile parent loads the iframe URL
 * with a stolen token, the bus is what stops it from steering the dashboard.
 */
type IncomingKinds = Extract<EmbedHandshake, { kind: 'set_filter' | 'request_height' }>;

interface UsePostMessageBusOptions {
  /** Allowed parent origins, exact-match. Messages from any other origin are dropped. */
  allowedOrigins: string[];
  /** Handler for valid host→embed messages. */
  onMessage: (msg: IncomingKinds) => void;
  /** Optional logger override; defaults to console.warn (DEV-only) */
  onWarn?: (reason: string, detail: unknown) => void;
}

interface PostMessageBus {
  /** Send a message to the validated parent origin (or `*` for the initial ready). */
  send: (msg: EmbedHandshake) => void;
  /** Last validated parent origin, or `null` if none seen yet. */
  parentOrigin: () => string | null;
}

export function usePostMessageBus(options: UsePostMessageBusOptions): PostMessageBus {
  const { allowedOrigins, onMessage, onWarn } = options;
  const allowed = useRef(new Set(allowedOrigins));
  const validatedParent = useRef<string | null>(null);

  // Keep the allow-list ref in sync if the prop changes (e.g. after the
  // capabilities call returns and we know the token's origins).
  useEffect(() => {
    allowed.current = new Set(allowedOrigins);
  }, [allowedOrigins]);

  // Stable reference so the message handler reads the latest onMessage.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    function handler(event: MessageEvent) {
      const origin = event.origin;
      if (!allowed.current.has(origin)) {
        if (import.meta.env.DEV) {
          onWarn?.('origin_rejected', { origin, allowed: [...allowed.current] });
        }
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object' || typeof data.kind !== 'string') {
        return;
      }

      // Only host→embed kinds are accepted on this side.
      if (data.kind !== 'set_filter' && data.kind !== 'request_height') {
        return;
      }

      const msg = data as IncomingKinds;
      if (msg.protocol_version !== CURRENT_PROTOCOL_VERSION) {
        if (import.meta.env.DEV) {
          onWarn?.('protocol_version_mismatch', {
            got: msg.protocol_version,
            want: CURRENT_PROTOCOL_VERSION,
          });
        }
        return;
      }

      validatedParent.current = origin;
      onMessageRef.current(msg);
    }

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onWarn]);

  const send = useCallback((msg: EmbedHandshake) => {
    if (typeof window === 'undefined' || window.parent === window) return;
    // The first `ready` may be sent before any inbound message arrives,
    // so fall back to `*` for that case only. Every subsequent message
    // is targeted to the validated parent origin.
    const target = validatedParent.current ?? (msg.kind === 'ready' ? '*' : null);
    if (target === null) return;
    window.parent.postMessage(msg, target);
  }, []);

  return {
    send,
    parentOrigin: () => validatedParent.current,
  };
}
