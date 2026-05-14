/**
 * Shared types for the admin control center. Everything the `/admin/*`
 * routes consume comes off the single `/api/admin/dashboard/` payload.
 * The shell fetches once and hands this down via Outlet context.
 */

export interface DayCount {
  date: string;
  count: number;
}

export interface FormatRow {
  format: string;
  count: number;
  failed: number;
  success_rate: number | null;
  avg_seconds: number;
  p95_seconds: number;
}

export type FailureKind = 'extraction' | 'pipeline' | 'model_parsing' | 'fragments';

export interface FailureRow {
  id: string;
  kind: FailureKind;
  format?: string | null;
  filename?: string | null;
  pipeline?: string | null;
  started_at: string | null;
  error_message: string;
}

export interface OutboundFailure {
  id: string;
  event_type: string;
  target_url: string;
  status: string;
  response_status_code: number | null;
  last_attempt_at: string | null;
  error: string;
}

export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  approval_status: string;
  created_at: string;
  company_name: string;
  role: string;
}

export interface AdminStats {
  users: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    recent_signups: DayCount[];
  };
  projects: {
    total: number;
    recent: number;
  };
  models: {
    total: number;
    total_size_bytes: number;
    by_status: Record<string, number>;
    recent_uploads: DayCount[];
    by_discipline: Record<string, number>;
  };
  types: {
    total_types: number;
    total_mapped: number;
    mapping_rate: number;
  };
  users_list: UserRow[];
  processing: {
    extraction: {
      by_format: FormatRow[];
      last_24h: Record<string, number>;
      recent_failures: FailureRow[];
    };
    pipelines: {
      last_24h: Record<string, number>;
      avg_duration_ms: number | null;
      recent_failures: FailureRow[];
    };
    models: {
      failure_counts: {
        parsing_failed: number;
        fragments_failed: number;
        legacy_error: number;
      };
      recent_parsing_failures: FailureRow[];
      recent_fragments_failures: FailureRow[];
    };
  };
  system: {
    database_ok: boolean;
    celery: { queue_depth: number | null; active_workers: number | null; broker_ok: boolean };
    last_extraction_completed_at: string | null;
    last_pipeline_completed_at: string | null;
    process_started_at: string;
    git_sha: string;
    hostname: string;
  };
  outbound: {
    subscriptions: { total: number; active: number };
    last_24h: Record<string, number>;
    success_rate_24h: number | null;
    recent_failures: OutboundFailure[];
  };
}

export interface AdminOutletContext {
  data: AdminStats;
  refetch: () => void;
}
