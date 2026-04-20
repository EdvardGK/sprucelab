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
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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

  const { users, projects, models, types, users_list } = data;
  const sortedUsers = sortUsers(users_list, sortKey, sortDir);

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
