import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/lib/api-types';

/**
 * React Query hooks for the webhook subscription + delivery API.
 *
 * Backend endpoints:
 *   - /api/automation/webhook-subscriptions/  (CRUD + custom actions)
 *   - /api/automation/webhook-deliveries/     (read-only + redeliver)
 *
 * The HMAC ``secret`` is returned exactly once on create / rotate-secret —
 * the UI shows it in a copy-banner and discards it after. Subsequent reads
 * never expose the secret.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookDeliveryStatus =
  | 'pending'
  | 'delivering'
  | 'success'
  | 'failed'
  | 'retrying';

export interface WebhookSubscription {
  id: string;
  project: string | null;
  project_name: string | null;
  event_type: string;
  target_url: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_fired_at: string | null;
  consecutive_failures: number;
}

/**
 * The create response: identical to the read shape plus the plaintext
 * ``secret`` (returned exactly once). Callers must copy it before the
 * banner is dismissed — there is no way to retrieve it again.
 */
export interface WebhookSubscriptionWithSecret extends WebhookSubscription {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  subscription: string | null;
  subscription_event_type: string | null;
  event_type: string;
  target_url: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  response_status_code: number | null;
  response_body: string;
  error: string;
  created_at: string;
  last_attempt_at: string | null;
  completed_at: string | null;
  payload: Record<string, unknown>;
}

export interface CreateWebhookSubscriptionInput {
  project?: string | null;
  event_type: string;
  target_url: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateWebhookSubscriptionInput {
  id: string;
  event_type?: string;
  target_url?: string;
  description?: string;
  is_active?: boolean;
}

export interface RotateSecretResponse {
  id: string;
  secret: string;
  message: string;
}

export interface TestWebhookResponse {
  delivery_id: string;
  status: 'queued';
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export interface WebhookSubscriptionFilters {
  project?: string;
  event_type?: string;
  is_active?: boolean;
}

export interface WebhookDeliveryFilters {
  subscription?: string;
  status?: WebhookDeliveryStatus;
  event_type?: string;
  page?: number;
}

export const webhookKeys = {
  all: ['webhooks'] as const,

  subscriptions: () => [...webhookKeys.all, 'subscriptions'] as const,
  subscriptionList: (filters: WebhookSubscriptionFilters) =>
    [...webhookKeys.subscriptions(), 'list', filters] as const,
  subscriptionDetail: (id: string) =>
    [...webhookKeys.subscriptions(), 'detail', id] as const,

  deliveries: () => [...webhookKeys.all, 'deliveries'] as const,
  deliveryList: (filters: WebhookDeliveryFilters) =>
    [...webhookKeys.deliveries(), 'list', filters] as const,
  deliveryDetail: (id: string) =>
    [...webhookKeys.deliveries(), 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toParams(filters: object): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  return params;
}

// ---------------------------------------------------------------------------
// Subscription hooks
// ---------------------------------------------------------------------------

export function useWebhookSubscriptions(filters: WebhookSubscriptionFilters = {}) {
  return useQuery({
    queryKey: webhookKeys.subscriptionList(filters),
    queryFn: async () => {
      const params = toParams(filters);
      const qs = params.toString();
      const url = qs
        ? `/automation/webhook-subscriptions/?${qs}`
        : '/automation/webhook-subscriptions/';
      const response = await apiClient.get<
        PaginatedResponse<WebhookSubscription> | WebhookSubscription[]
      >(url);
      const data = response.data;
      return Array.isArray(data) ? data : data.results;
    },
    staleTime: 15_000,
  });
}

export function useWebhookSubscription(id: string | undefined) {
  return useQuery({
    queryKey: webhookKeys.subscriptionDetail(id ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<WebhookSubscription>(
        `/automation/webhook-subscriptions/${id}/`,
      );
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWebhookSubscriptionInput) => {
      const response = await apiClient.post<WebhookSubscriptionWithSecret>(
        '/automation/webhook-subscriptions/',
        input,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.subscriptions() });
    },
  });
}

export function useUpdateWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateWebhookSubscriptionInput) => {
      const response = await apiClient.patch<WebhookSubscription>(
        `/automation/webhook-subscriptions/${id}/`,
        patch,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.subscriptions() });
      queryClient.invalidateQueries({
        queryKey: webhookKeys.subscriptionDetail(variables.id),
      });
    },
  });
}

export function useDeleteWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/automation/webhook-subscriptions/${id}/`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.subscriptions() });
    },
  });
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<RotateSecretResponse>(
        `/automation/webhook-subscriptions/${id}/rotate-secret/`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.subscriptions() });
    },
  });
}

/**
 * Send a synthetic ``webhook.test`` event through the full dispatcher so
 * HMAC signing + retry semantics match production. Returns the queued
 * delivery id — the deliveries page will show progress.
 */
export function useTestWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<TestWebhookResponse>(
        `/automation/webhook-subscriptions/${id}/test/`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries() });
    },
  });
}

// ---------------------------------------------------------------------------
// Delivery hooks
// ---------------------------------------------------------------------------

export interface DeliveryListResult {
  results: WebhookDelivery[];
  count: number;
  next: string | null;
  previous: string | null;
}

export function useWebhookDeliveries(filters: WebhookDeliveryFilters = {}) {
  return useQuery({
    queryKey: webhookKeys.deliveryList(filters),
    queryFn: async (): Promise<DeliveryListResult> => {
      const params = toParams(filters);
      const qs = params.toString();
      const url = qs
        ? `/automation/webhook-deliveries/?${qs}`
        : '/automation/webhook-deliveries/';
      const response = await apiClient.get<
        PaginatedResponse<WebhookDelivery> | WebhookDelivery[]
      >(url);
      const data = response.data;
      if (Array.isArray(data)) {
        return {
          results: data,
          count: data.length,
          next: null,
          previous: null,
        };
      }
      return data;
    },
    staleTime: 10_000,
  });
}

export function useRedeliverWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const response = await apiClient.post<WebhookDelivery>(
        `/automation/webhook-deliveries/${deliveryId}/redeliver/`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries() });
    },
  });
}
