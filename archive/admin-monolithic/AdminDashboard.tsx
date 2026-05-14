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
  Info,
  type LucideIcon,
} from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { DashboardTile } from '@/components/Layout/DashboardTile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sparkline } from '@/components/features/warehouse-v2/Sparkline';
import { useCountUp } from '@/components/features/warehouse-v2/useCountUp';
import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';

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

type FailureKind = 'extraction' | 'pipeline' | 'model_parsing' | 'fragments';

interface FailureRow {
  id: string;
  kind: FailureKind;
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
// Tone system — lifted from AnalysisKpiCluster (Model dashboard) so tiles
// here read with the same visual grammar as the Types/Models pages.
// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'good' | 'warning' | 'danger';

const TONE_STYLES: Record<Tone, { card: string; value: string; icon: string; spark: string }> = {
  neutral: {
    card: '',
    value: 'text-text-primary',
    icon: 'text-text-tertiary',
    spark: 'hsl(220 9% 46%)',
  },
  good: {
    card: 'ring-1 ring-[hsl(158_70%_28%/0.25)]',
    value: 'text-[hsl(158_70%_28%)]',
    icon: 'text-[hsl(158_70%_28%)]',
    spark: 'hsl(158 70% 28%)',
  },
  warning: {
    card: 'ring-1 ring-amber-400/40',
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500',
    spark: 'hsl(38 92% 50%)',
  },
  danger: {
    card: 'ring-1 ring-red-400/50',
    value: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500',
    spark: 'hsl(0 84% 60%)',
  },
};

function toneForRate(frac: number | null | undefined): Tone {
  if (frac == null) return 'neutral';
  if (frac >= 0.95) return 'good';
  if (frac >= 0.8) return 'warning';
  return 'danger';
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

// ---------------------------------------------------------------------------
// DailyBars — 30-day daily-count bar chart (the pre-existing inline
// sparkline, kept for signups/uploads). Distinct from `Sparkline` from
// warehouse-v2 which does stacked / progress strips.
// ---------------------------------------------------------------------------

function DailyBars({ data, color = 'var(--color-accent)' }: { data: DayCount[]; color?: string }) {
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
// InfoBadge — small (i) icon with a Radix tooltip explaining the metric.
// Drop into any section header for hover-discoverable docs.
// ---------------------------------------------------------------------------

function InfoBadge({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-text-tertiary hover:text-text-primary transition-colors p-0.5"
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// KpiTile — DashboardTile-based metric with tone ring, animated count-up,
// optional sparkline / subline / unit suffix, and an info tooltip.
// ---------------------------------------------------------------------------

interface KpiTileProps {
  id: string;
  label: string;
  icon: LucideIcon;
  info: string;
  tone?: Tone;

  // Numeric value path — animates via useCountUp.
  numericValue?: number;
  unit?: string;
  decimals?: number;
  formatter?: (v: number) => string;

  // String value path — renders as-is (e.g. formatted bytes).
  displayValue?: string;

  subline?: string;

  // Sparkline variants — pick at most one.
  progressFraction?: number; // 0–1 -> progress strip
  bars?: DayCount[]; // 30-day daily bars
}

function KpiTile({
  id,
  label,
  icon: Icon,
  info,
  tone = 'neutral',
  numericValue,
  unit,
  decimals,
  formatter,
  displayValue,
  subline,
  progressFraction,
  bars,
}: KpiTileProps) {
  const styles = TONE_STYLES[tone];
  const animated = useCountUp(numericValue ?? 0, {
    duration: 600,
    fraction: typeof decimals === 'number' && decimals > 0,
  });

  let rendered: string;
  if (displayValue !== undefined) {
    rendered = displayValue;
  } else if (formatter) {
    rendered = formatter(animated);
  } else if (typeof decimals === 'number') {
    rendered = animated.toFixed(decimals);
  } else {
    rendered = animated.toLocaleString();
  }

  return (
    <DashboardTile
      id={id}
      className={cn(
        'p-[clamp(0.5rem,1vw,1rem)] flex flex-col justify-between min-h-[clamp(5.5rem,11vh,7.5rem)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        styles.card,
      )}
    >
      <div className="flex items-center justify-between text-text-tertiary">
        <span className="text-[clamp(0.55rem,0.7vw,0.75rem)] uppercase tracking-wide font-medium truncate">
          {label}
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <Icon className={cn('h-[clamp(0.875rem,1.4vw,1rem)] w-[clamp(0.875rem,1.4vw,1rem)]', styles.icon)} />
          <InfoBadge text={info} />
        </span>
      </div>
      <div>
        <div className="flex items-baseline gap-[clamp(0.15rem,0.3vw,0.3rem)] flex-wrap">
          <span className={cn('text-[clamp(1.25rem,2.4vw,2.25rem)] font-semibold tabular-nums leading-tight', styles.value)}>
            {rendered}
          </span>
          {unit ? (
            <span className="text-[clamp(0.7rem,0.9vw,0.95rem)] text-text-tertiary">{unit}</span>
          ) : null}
        </div>
        {subline ? (
          <div className="mt-[clamp(0.125rem,0.4vh,0.375rem)] text-[clamp(0.55rem,0.7vw,0.7rem)] text-text-tertiary truncate">
            {subline}
          </div>
        ) : null}
      </div>
      {progressFraction !== undefined ? (
        <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">
          <Sparkline
            segments={[]}
            variant="progress"
            progressValue={Math.max(0, Math.min(100, progressFraction * 100))}
            progressColor={styles.spark}
          />
        </div>
      ) : null}
      {bars ? <div className="mt-[clamp(0.25rem,0.5vh,0.5rem)]">{<DailyBars data={bars} color={styles.spark} />}</div> : null}
    </DashboardTile>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — Card with title + info-icon. Wraps every detail panel so
// the user always knows what a section is reporting on.
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  info,
  icon: Icon,
  children,
}: {
  title: string;
  info: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[clamp(0.75rem,1.5vw,0.875rem)] flex items-center gap-2">
          {Icon ? <Icon className="h-[clamp(0.875rem,1.5vw,1rem)] w-[clamp(0.875rem,1.5vw,1rem)] text-text-tertiary" /> : null}
          <span>{title}</span>
          <InfoBadge text={info} />
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FailureItem — one row in the recent-failures feed; status-dot + kind +
// relative time + truncated error.
// ---------------------------------------------------------------------------

const KIND_DOT: Record<FailureKind, string> = {
  extraction: 'bg-red-500',
  pipeline: 'bg-orange-500',
  model_parsing: 'bg-amber-500',
  fragments: 'bg-pink-500',
};

function FailureItem({ f, kindLabel }: { f: FailureRow; kindLabel: string }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 text-[clamp(0.625rem,1.2vw,0.75rem)]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className={cn('h-2 w-2 rounded-full shrink-0', KIND_DOT[f.kind])} />
          {kindLabel}
          {f.format ? <span className="font-mono uppercase ml-1 text-text-tertiary">{f.format}</span> : null}
        </span>
        <span className="text-text-secondary tabular-nums">{formatRelative(f.started_at)}</span>
      </div>
      <div className="text-text-secondary text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 truncate">
        {f.filename || f.pipeline || ''}
      </div>
      <div className="text-red-700 text-[clamp(0.5rem,1vw,0.625rem)] mt-0.5 line-clamp-2">
        {f.error_message || '(no error message)'}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — small pill used in the user-management table.
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
    refetchInterval: 30_000,
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

  const ext24 = processing.extraction.last_24h;
  const ext24Total = (ext24.completed ?? 0) + (ext24.failed ?? 0);
  const ext24SuccessRate = ext24Total ? (ext24.completed ?? 0) / ext24Total : null;
  const ext24Tone = toneForRate(ext24SuccessRate);

  const workersOk = (system.celery.active_workers ?? 0) > 0;
  const queueBusy = (system.celery.queue_depth ?? 0) > 50;

  // Interleave every failure kind by timestamp, newest first.
  const allFailures: FailureRow[] = [
    ...processing.extraction.recent_failures,
    ...processing.pipelines.recent_failures,
    ...processing.models.recent_parsing_failures,
    ...processing.models.recent_fragments_failures,
  ]
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    .slice(0, 12);

  const totalSilentFailures =
    processing.models.failure_counts.parsing_failed +
    processing.models.failure_counts.fragments_failed +
    processing.models.failure_counts.legacy_error;

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
        <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Shield className="h-[clamp(1.25rem,2.5vw,1.75rem)] w-[clamp(1.25rem,2.5vw,1.75rem)] text-primary" />
            <h1 className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold text-text-primary">
              {t('admin.title')}
            </h1>
            <InfoBadge text={t('admin.tooltips.page')} />
          </div>

          {/* Hero — Processing health (the operator's "is it on fire" strip) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
            <KpiTile
              id="kpi-success-rate"
              label={t('admin.processing.successRate24h')}
              icon={Activity}
              info={t('admin.tooltips.successRate24h')}
              tone={ext24Tone}
              displayValue={formatPercent(ext24SuccessRate)}
              progressFraction={ext24SuccessRate ?? 0}
              subline={`${ext24.completed ?? 0} ${t('admin.processing.completed')} · ${ext24.failed ?? 0} ${t('admin.processing.failed')}`}
            />
            <KpiTile
              id="kpi-avg-pipeline"
              label={t('admin.processing.avgPipeline')}
              icon={Clock}
              info={t('admin.tooltips.avgPipeline')}
              displayValue={formatMs(processing.pipelines.avg_duration_ms)}
              subline={`${processing.pipelines.last_24h.success ?? 0} ${t('admin.processing.completed')}`}
            />
            <KpiTile
              id="kpi-queue-depth"
              label={t('admin.processing.queueDepth')}
              icon={Cpu}
              info={t('admin.tooltips.queueDepth')}
              tone={queueBusy ? 'warning' : 'neutral'}
              numericValue={system.celery.queue_depth ?? 0}
              displayValue={system.celery.queue_depth == null ? '—' : undefined}
            />
            <KpiTile
              id="kpi-workers"
              label={t('admin.processing.activeWorkers')}
              icon={Server}
              info={t('admin.tooltips.workers')}
              tone={workersOk ? 'good' : 'danger'}
              numericValue={system.celery.active_workers ?? 0}
              displayValue={system.celery.active_workers == null ? '—' : undefined}
            />
          </div>

          {/* Platform counts — same dimensions you listed: users, apps,
              projects, models, storage, types-mapped. */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[clamp(0.5rem,1vw,1rem)]">
            <KpiTile
              id="kpi-users"
              label={t('admin.totalUsers')}
              icon={Users}
              info={t('admin.tooltips.totalUsers')}
              numericValue={users.total}
              subline={`${users.approved} ${t('admin.approved').toLowerCase()}`}
            />
            <KpiTile
              id="kpi-approved"
              label={t('admin.approved')}
              icon={CheckCircle2}
              info={t('admin.tooltips.approved')}
              tone="good"
              numericValue={users.approved}
              progressFraction={users.total ? users.approved / users.total : 0}
            />
            <KpiTile
              id="kpi-pending"
              label={t('admin.pending')}
              icon={Clock}
              info={t('admin.tooltips.pending')}
              tone={users.pending > 0 ? 'warning' : 'neutral'}
              numericValue={users.pending}
            />
            <KpiTile
              id="kpi-projects"
              label={t('admin.projects')}
              icon={FolderOpen}
              info={t('admin.tooltips.projects')}
              numericValue={projects.total}
              subline={`+${projects.recent} ${t('admin.in30d')}`}
            />
            <KpiTile
              id="kpi-models"
              label={t('admin.models')}
              icon={Box}
              info={t('admin.tooltips.models')}
              numericValue={models.total}
              subline={`${models.by_status.ready ?? 0} ${t('admin.ready').toLowerCase()} · ${models.by_status.error ?? 0} ${t('admin.error').toLowerCase()}`}
            />
            <KpiTile
              id="kpi-storage"
              label={t('admin.storage')}
              icon={Database}
              info={t('admin.tooltips.storage')}
              displayValue={formatBytes(models.total_size_bytes)}
            />
          </div>

          {/* Activity row — signups & uploads sparklines + model-status mix */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[clamp(0.5rem,1vw,1rem)]">
            <SectionCard title={t('admin.signups30d')} info={t('admin.tooltips.signups30d')} icon={Users}>
              <DailyBars data={users.recent_signups} color="hsl(158 70% 28%)" />
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary mt-1 tabular-nums">
                {users.recent_signups.reduce((s, d) => s + d.count, 0)} {t('admin.inLast30Days')}
              </p>
            </SectionCard>
            <SectionCard title={t('admin.uploads30d')} info={t('admin.tooltips.uploads30d')} icon={Box}>
              <DailyBars data={models.recent_uploads} color="hsl(220 70% 45%)" />
              <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary mt-1 tabular-nums">
                {models.recent_uploads.reduce((s, d) => s + d.count, 0)} {t('admin.inLast30Days')}
              </p>
            </SectionCard>
            <SectionCard title={t('admin.modelHealth')} info={t('admin.tooltips.modelHealth')} icon={Activity}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[clamp(0.625rem,1.2vw,0.75rem)] tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {t('admin.ready')}: {models.by_status.ready ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-yellow-500" />
                    {t('admin.processing')}: {models.by_status.processing ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {t('admin.error')}: {models.by_status.error ?? 0}
                  </span>
                </div>
                {Object.keys(models.by_discipline).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(models.by_discipline).map(([disc, count]) => (
                      <span
                        key={disc}
                        className="inline-flex items-center px-2 py-0.5 rounded bg-surface-secondary text-[clamp(0.5rem,1vw,0.625rem)] font-medium tabular-nums"
                      >
                        {disc}: {count}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary">
                  {t('admin.typeMappingRate')}:{' '}
                  <span className="font-medium text-text-primary tabular-nums">
                    {types.mapping_rate}%
                  </span>{' '}
                  <span className="tabular-nums">
                    ({types.total_mapped}/{types.total_types})
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Processing-by-format table + the unified failures feed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[clamp(0.5rem,1vw,1rem)]">
            <SectionCard title={t('admin.processing.title')} info={t('admin.tooltips.processingByFormat')} icon={Activity}>
              <div className="overflow-x-auto">
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
                      {processing.extraction.by_format.map((row) => {
                        const tone = toneForRate(row.success_rate);
                        return (
                          <tr key={row.format} className="border-b border-border-subtle hover:bg-surface-secondary/40 transition-colors">
                            <td className="py-1.5 px-2 font-mono uppercase">{row.format}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{row.count}</td>
                            <td className={cn('py-1.5 px-2 text-right tabular-nums', TONE_STYLES[tone].value)}>
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
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </SectionCard>

            <SectionCard title={t('admin.failures.title')} info={t('admin.tooltips.failures')} icon={AlertTriangle}>
              {totalSilentFailures > 0 && (
                <div className="mb-3 text-[clamp(0.625rem,1.2vw,0.75rem)] flex flex-wrap items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-amber-800 dark:text-amber-300">
                    {t('admin.failures.silentBanner', {
                      total: totalSilentFailures,
                      parsing: processing.models.failure_counts.parsing_failed,
                      fragments: processing.models.failure_counts.fragments_failed,
                    })}
                  </span>
                </div>
              )}
              {allFailures.length === 0 ? (
                <p className="text-[hsl(158_70%_28%)] text-[clamp(0.625rem,1.2vw,0.75rem)] py-4">
                  {t('admin.failures.empty')}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {allFailures.map((f) => (
                    <FailureItem
                      key={`${f.kind}-${f.id}`}
                      f={f}
                      kindLabel={t(`admin.failures.kind.${f.kind}`)}
                    />
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* Outbound webhooks */}
          <SectionCard title={t('admin.outbound.title')} info={t('admin.tooltips.outbound')} icon={Webhook}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[clamp(0.625rem,1.2vw,0.75rem)] tabular-nums">
                <span>
                  <span className="text-text-secondary">{t('admin.outbound.activeSubs')}: </span>
                  <span className="font-medium">{outbound.subscriptions.active}</span>
                  <span className="text-text-secondary"> / {outbound.subscriptions.total}</span>
                </span>
                <span>
                  <span className="text-text-secondary">{t('admin.outbound.success24h')}: </span>
                  <span className={cn('font-medium', TONE_STYLES[toneForRate(outbound.success_rate_24h)].value)}>
                    {formatPercent(outbound.success_rate_24h)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {outbound.last_24h.success ?? 0}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {outbound.last_24h.failed ?? 0}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  {outbound.last_24h.retrying ?? 0}
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
            </div>
          </SectionCard>

          {/* System status footer */}
          <SectionCard title={t('admin.system.title')} info={t('admin.tooltips.system')} icon={Server}>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[clamp(0.625rem,1.2vw,0.75rem)]">
              <SystemStat
                label={t('admin.system.database')}
                value={system.database_ok ? t('admin.system.ok') : t('admin.system.down')}
                tone={system.database_ok ? 'good' : 'danger'}
              />
              <SystemStat
                label={t('admin.system.broker')}
                value={system.celery.broker_ok ? t('admin.system.ok') : t('admin.system.down')}
                tone={system.celery.broker_ok ? 'good' : 'danger'}
              />
              <SystemStat
                label={t('admin.system.workers')}
                value={String(system.celery.active_workers ?? '—')}
                tone={workersOk ? 'good' : 'danger'}
              />
              <SystemStat
                label={t('admin.system.queue')}
                value={String(system.celery.queue_depth ?? '—')}
                tone={queueBusy ? 'warning' : 'neutral'}
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
          </SectionCard>

          {/* User management table */}
          <SectionCard title={t('admin.userManagement')} info={t('admin.tooltips.userManagement')} icon={Users}>
            <div className="overflow-x-auto">
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
                    <tr key={u.id} className="border-b border-border-subtle hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-2 px-2 font-mono">{u.email}</td>
                      <td className="py-2 px-2">{u.display_name || '—'}</td>
                      <td className="py-2 px-2">{u.company_name || '—'}</td>
                      <td className="py-2 px-2">{u.role || '—'}</td>
                      <td className="py-2 px-2">
                        <StatusBadge status={u.approval_status} />
                      </td>
                      <td className="py-2 px-2 tabular-nums">{formatDate(u.created_at)}</td>
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
            </div>
          </SectionCard>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// SystemStat — dt/dd pair for the System panel
// ---------------------------------------------------------------------------

function SystemStat({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="flex flex-col">
      <dt className="text-text-tertiary text-[clamp(0.5rem,1vw,0.625rem)] uppercase tracking-wider">
        {label}
      </dt>
      <dd className={cn('font-medium tabular-nums flex items-center gap-1', styles.value)}>
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {value}
      </dd>
    </div>
  );
}
