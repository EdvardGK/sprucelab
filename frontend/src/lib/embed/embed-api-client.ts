import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

/**
 * Build an axios client that authenticates via the embed scheme
 * (`Authorization: Embed <raw-token>`).
 *
 * Separate instance from `api-client.ts` so the Supabase request
 * interceptor never fires here — the iframe page is anonymous-by-design,
 * the token is the only credential.
 */
export function createEmbedApiClient(rawToken: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
    // No credentials — the iframe must not send the parent's cookies.
    withCredentials: false,
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (rawToken) {
      config.headers.set('Authorization', `Embed ${rawToken}`);
    }
    return config;
  });

  return client;
}

export interface EmbedCapabilitiesResponse {
  api_version: string;
  service: string;
  protocol_version: number;
  token: {
    project_id: string;
    allowed_origins: string[];
    capabilities: string[];
    expires_at: string | null;
  };
  endpoints: {
    instances: string;
    capabilities: string;
    token_refresh: string;
  };
  supported_filters: Record<string, unknown>;
  response_shape: Record<string, unknown>;
  truncation: {
    threshold_instances: number;
    fallback_mode: string;
    rationale: string;
  };
  auth: { scheme: string; header: string; query_param: string };
  notes: string;
}

export interface EmbedInstancesResponse {
  type_ids: string[];
  type_count: number;
  instance_count: number;
  truncated: boolean;
  threshold_instances: number;
  applied_filters: Record<string, unknown>;
  skipped_filters: string[];
}
