import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  Users,
  FolderOpen,
  Box,
  Database,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity,
  Cpu,
  Webhook,
  Server,
  GitCommit,
} from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayCount {
  date: string;
  count: number;
}

interface FormatRow {
  format: string;
  count: number;
  failed: number;
  success_rate: number | null;
  avg_seconds: number;
  p95_seconds: number;
}

interface FailureRow {
  id: string;
  kind: 'extraction' | 'pipeline';
  format?: string | null;
  filename?: string | null;
  pipeline?: string | null;
  started_at: string | null;
  error_message: string;
}

interface OutboundFailure {
  id: string;
  event_type: string;
  target_url: string;
  status: string;
  response_status_code: number | null;
  last_attempt_at: string | null;
  error: string;
}

interface AdminStats {
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

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  approval_status: string;
  created_at: string;
  company_name: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatSeconds(s: number | null | undefined): string {
  if (s == null) return '—';
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return formatSeconds(ms / 1000);
}

function formatPercent(frac: number | null | undefined): string {
  if (frac == null) return '—';
  return `${(frac * 100).toFixed(1)}%`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h ago`;
}

// Traffic-light color for a success-rate fraction (0–1). Mirrors the
// thresholds in lib/discipline-tokens.ts so future MetricCard adoption stays
// consistent.
function rateColor(frac: number | null): string {
  if (frac == null) return 'text-text-secondary';
  if (frac >= 0.95) return 'text-green-600';
  if (frac >= 0.8) return 'text-yellow-600';
  return 'text-red-600';
}

// ---------------------------------------------------------------------------
// Sparkline — tiny inline SVG bar chart
// ---------------------------------------------------------------------------

function Sparkline({ data, color = 'var(--color-accent)' }: { data: DayCount[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 200;
  const h = 32;
  const barW = w / data.length - 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.count / max) * h;
        return (
          <rect
            key={d.date}
            x={i * (barW + 1)}
            y={h - barH}
            width={barW}
            height={Math.max(barH, 0.5)}
            fill={color}
            opacity={0.7}
            rx={1}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort helper for user table
// ---------------------------------------------------------------------------

type SortKey = 'email' | 'display_name' | 'approval_status' | 'created_at' | 'company_name' | 'role';
type SortDir = 'asc' | 'desc';

function sortUsers(users: UserRow[], key: SortKey, dir: SortDir): UserRow[] {
  return [...users].sort((a, b) => {
    const av = (a[key] ?? '').toString().toLowerCase();
    const bv = (b[key] ?? '').toString().toLowerCase();
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AdminStats>({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiClient.get('/admin/dashboard/').then((r) => r.data),
  });

  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const approveMutation = useMutation({
    mutationFn: (userId: number) => apiClient.post(`/admin/users/${userId}/approve/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (userId: number) => apiClient.post(`/admin/users/${userId}/reject/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  };

  // ── Loading / error ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-text-secondary">
          {t('common.loading')}
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-red-600 gap-2">
          <AlertTriangle className="h-5 w-5" />
          {t('admin.accessDenied')}
        </div>
      </AppLayout>
    );
  }

  const { users, projects, models, types, users_list, processing, system, outbound } = data;
  const sortedUsers = sortUsers(users_list, sortKey, sortDir);

  // 24-hour extraction success rate — derived once, used in both the
  // Processing KPI strip and the System panel's traffic-light tints.
  const ext24 = processing.extraction.last_24h;
  const ext24Total = (ext24.completed ?? 0) + (ext24.failed ?? 0);
  const ext24SuccessRate = ext24Total ? (ext24.completed ?? 0) / ext24Total : null;

  // Interleave extraction + pipeline failures by started_at, newest first.
  const allFailures: FailureRow[] = [
    ...processing.extraction.recent_failures,
    ...processing.pipelines.recent_failures,
  ]
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    .slice(0, 10);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12 gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="h-[clamp(1.25rem,2.5vw,1.75rem)] w-[clamp(1.25rem,2.5vw,1.75rem)] text-primary" />
          <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold text-text-primary">
            {t('admin.title')}
          </h1>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-[clamp(0.5rem,1.5vw,1rem)]">
          <KpiCard icon={Users} label={t('admin.totalUsers')} value={users.total} />
          <KpiCard
            icon={CheckCircle2}
            label={t('admin.approved')}
            value={users.approved}
            color="text-green-600"
          />
          <KpiCard
            icon={Clock}
            label={t('admin.pending')}
            value={users.pending}
            color="text-yellow-600"
          />
          <KpiCard icon={FolderOpen} label={t('admin.projects')} value={projects.total} />
          <KpiCard icon={Box} label={t('admin.models')} value={models.total} />
          <KpiCard
            icon={Database}
            label={t('admin.storage')}
            value={formatBytes(models.total_size_bytes)}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[clamp(0.5rem,1.5vw,1rem)]">
          {/* Signups sparkline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
                {t('admin.signups30d')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={users.recent_signups} color="var(--color-accent)" />
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary mt-1">
                {users.recent_signups.reduce((s, d) => s + d.count, 0)} {t('admin.inLast30Days')}
              </p>
            </CardContent>
          </Card>

          {/* Uploads sparkline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
                {t('admin.uploads30d')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={models.recent_uploads} color="var(--color-primary)" />
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary mt-1">
                {models.recent_uploads.reduce((s, d) => s + d.count, 0)} {t('admin.inLast30Days')}
              </p>
            </CardContent>
          </Card>

          {/* Model status + discipline breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
                {t('admin.modelHealth')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                <span className="text-green-600">
                  {t('admin.ready')}: {models.by_status.ready ?? 0}
                </span>
                <span className="text-yellow-600">
                  {t('admin.processing')}: {models.by_status.processing ?? 0}
                </span>
                <span className="text-red-600">
                  {t('admin.error')}: {models.by_status.error ?? 0}
                </span>
              </div>
              {Object.keys(models.by_discipline).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(models.by_discipline).map(([disc, count]) => (
                    <span
                      key={disc}
                      className="inline-flex items-center px-2 py-0.5 rounded bg-surface-secondary text-[clamp(0.5rem,1vw,0.625rem)] font-medium"
                    >
                      {disc}: {count}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                {t('admin.typeMappingRate')}: {types.mapping_rate}% ({types.total_mapped}/{types.total_types})
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Processing strip — 24h success rate, avg pipeline, queue, workers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1.5vw,1rem)]">
          <KpiCard
            icon={Activity}
            label={t('admin.processing.successRate24h')}
            value={formatPercent(ext24SuccessRate)}
            color={rateColor(ext24SuccessRate)}
          />
          <KpiCard
            icon={Clock}
            label={t('admin.processing.avgPipeline')}
            value={formatMs(processing.pipelines.avg_duration_ms)}
          />
          <KpiCard
            icon={Cpu}
            label={t('admin.processing.queueDepth')}
            value={system.celery.queue_depth ?? '—'}
            color={
              system.celery.queue_depth != null && system.celery.queue_depth > 50
                ? 'text-yellow-600'
                : undefined
            }
          />
          <KpiCard
            icon={Server}
            label={t('admin.processing.activeWorkers')}
            value={system.celery.active_workers ?? '—'}
            color={
              system.celery.active_workers != null && system.celery.active_workers > 0
                ? 'text-green-600'
                : 'text-red-600'
            }
          />
        </div>

        {/* Processing by format + failures feed — side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[clamp(0.5rem,1.5vw,1rem)]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
                {t('admin.processing.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {processing.extraction.by_format.length === 0 ? (
                <p className="text-text-secondary text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
                  {t('admin.processing.noRuns')}
                </p>
              ) : (
                <table className="w-full text-[clamp(0.625rem,1.2vw,0.75rem)]">
                  <thead>
                    <tr className="border-b text-left text-text-secondary">
                      <th className="py-2 px-2 font-medium">{t('admin.processing.tableFormat')}</th>
                      <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableCount')}</th>
                      <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableSuccess')}</th>
                      <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableAvg')}</th>
                      <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableP95')}</th>
                      <th className="py-2 px-2 font-medium text-right">{t('admin.processing.tableFailed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processing.extraction.by_format.map((row) => (
                      <tr key={row.format} className="border-b border-border-subtle">
                        <td className="py-1.5 px-2 font-mono uppercase">{row.format}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{row.count}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${rateColor(row.success_rate)}`}>
                          {formatPercent(row.success_rate)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {formatSeconds(row.avg_seconds)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {formatSeconds(row.p95_seconds)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-red-600">
                          {row.failed || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
                {t('admin.failures.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allFailures.length === 0 ? (
                <p className="text-green-700 text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
                  {t('admin.failures.empty')}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {allFailures.map((f) => (
                    <li key={f.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3 text-red-600" />
                          {f.kind === 'extraction'
                            ? t('admin.failures.kindExtraction')
                            : t('admin.failures.kindPipeline')}
                          {f.format ? <span className="font-mono uppercase ml-1">{f.format}</span> : null}
                        </span>
                        <span className="text-text-secondary tabular-nums">
                          {formatRelative(f.started_at)}
                        </span>
                      </div>
                      <div className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 truncate">
                        {f.filename || f.pipeline || ''}
                      </div>
                      <div className="text-red-700 text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 line-clamp-2">
                        {f.error_message || '(no error message)'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Outbound webhooks */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Webhook className="h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] text-text-secondary" />
            <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
              {t('admin.outbound.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[clamp(0.625rem,1.2vw,0.75rem)]">
              <span>
                <span className="text-text-secondary">{t('admin.outbound.activeSubs')}: </span>
                <span className="font-medium tabular-nums">
                  {outbound.subscriptions.active}
                </span>
                <span className="text-text-secondary">
                  {' '}/ {outbound.subscriptions.total}
                </span>
              </span>
              <span>
                <span className="text-text-secondary">{t('admin.outbound.success24h')}: </span>
                <span className={`font-medium tabular-nums ${rateColor(outbound.success_rate_24h)}`}>
                  {formatPercent(outbound.success_rate_24h)}
                </span>
              </span>
              <span className="text-green-600">
                ✓ {outbound.last_24h.success ?? 0}
              </span>
              <span className="text-red-600">
                ✗ {outbound.last_24h.failed ?? 0}
              </span>
              <span className="text-yellow-600">
                ↻ {outbound.last_24h.retrying ?? 0}
              </span>
            </div>
            {outbound.recent_failures.length > 0 && (
              <div className="border-t border-border-subtle pt-2">
                <p className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] uppercase tracking-wider mb-1">
                  {t('admin.outbound.recentFailures')}
                </p>
                <ul className="divide-y divide-border-subtle">
                  {outbound.recent_failures.map((d) => (
                    <li key={d.id} className="py-1.5 text-[clamp(0.625rem,1.2vw,0.75rem)]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono truncate">{d.event_type}</span>
                        <span className="text-text-secondary tabular-nums">
                          {formatRelative(d.last_attempt_at)}
                        </span>
                      </div>
                      <div className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] truncate">
                        → {d.target_url}{' '}
                        {d.response_status_code ? (
                          <span className="text-red-600 ml-1">[{d.response_status_code}]</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System status footer */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Server className="h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] text-text-secondary" />
            <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)]">
              {t('admin.system.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[clamp(0.625rem,1.2vw,0.75rem)]">
              <SystemStat
                label={t('admin.system.database')}
                value={system.database_ok ? t('admin.system.ok') : t('admin.system.down')}
                tone={system.database_ok ? 'good' : 'bad'}
              />
              <SystemStat
                label={t('admin.system.broker')}
                value={system.celery.broker_ok ? t('admin.system.ok') : t('admin.system.down')}
                tone={system.celery.broker_ok ? 'good' : 'bad'}
              />
              <SystemStat
                label={t('admin.system.workers')}
                value={String(system.celery.active_workers ?? '—')}
                tone={
                  system.celery.active_workers != null && system.celery.active_workers > 0
                    ? 'good'
                    : 'bad'
                }
              />
              <SystemStat
                label={t('admin.system.queue')}
                value={String(system.celery.queue_depth ?? '—')}
              />
              <SystemStat
                label={t('admin.system.uptime')}
                value={formatRelative(system.process_started_at).replace(' ago', '')}
              />
              <SystemStat
                label={t('admin.system.lastExtraction')}
                value={formatRelative(system.last_extraction_completed_at)}
              />
              <SystemStat
                label={t('admin.system.lastPipeline')}
                value={formatRelative(system.last_pipeline_completed_at)}
              />
              <SystemStat
                label={t('admin.system.gitSha')}
                value={system.git_sha.slice(0, 7)}
                icon={GitCommit}
              />
            </dl>
          </CardContent>
        </Card>

        {/* User management table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[clamp(0.875rem,1.8vw,1.125rem)]">
              {t('admin.userManagement')}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-[clamp(0.625rem,1.2vw,0.75rem)]">
              <thead>
                <tr className="border-b text-left text-text-secondary">
                  {([
                    ['email', t('admin.email')],
                    ['display_name', t('admin.name')],
                    ['company_name', t('admin.company')],
                    ['role', t('admin.role')],
                    ['approval_status', t('admin.status')],
                    ['created_at', t('admin.registered')],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      className="py-2 px-2 font-medium cursor-pointer select-none hover:text-text-primary"
                      onClick={() => toggleSort(key)}
                    >
                      {label} <SortIcon col={key} />
                    </th>
                  ))}
                  <th className="py-2 px-2 font-medium">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border-subtle hover:bg-surface-secondary/50">
                    <td className="py-2 px-2 font-mono">{u.email}</td>
                    <td className="py-2 px-2">{u.display_name || '—'}</td>
                    <td className="py-2 px-2">{u.company_name || '—'}</td>
                    <td className="py-2 px-2">{u.role || '—'}</td>
                    <td className="py-2 px-2">
                      <StatusBadge status={u.approval_status} />
                    </td>
                    <td className="py-2 px-2">{formatDate(u.created_at)}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {u.approval_status !== 'approved' && (
                          <button
                            onClick={() => approveMutation.mutate(u.id)}
                            disabled={approveMutation.isPending}
                            className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                          >
                            {t('admin.approve')}
                          </button>
                        )}
                        {u.approval_status !== 'rejected' && (
                          <button
                            onClick={() => rejectMutation.mutate(u.id)}
                            disabled={rejectMutation.isPending}
                            className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
                          >
                            {t('admin.reject')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedUsers.length === 0 && (
              <p className="text-center text-text-secondary py-8">{t('admin.noUsers')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-[clamp(0.5rem,1.5vw,1rem)]">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] ${color ?? 'text-text-secondary'}`} />
          <span className="text-[clamp(0.5rem,1vw,0.625rem)] text-text-secondary font-medium uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className={`text-[clamp(1.25rem,3vw,1.75rem)] font-bold ${color ?? 'text-text-primary'}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SystemStat — dt/dd pair for the System panel
// ---------------------------------------------------------------------------

function SystemStat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-600'
      : tone === 'bad'
        ? 'text-red-600'
        : 'text-text-primary';
  return (
    <div className="flex flex-col">
      <dt className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] uppercase tracking-wider">
        {label}
      </dt>
      <dd className={`font-medium tabular-nums flex items-center gap-1 ${toneClass}`}>
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {value}
      </dd>
    </div>
  );
}
