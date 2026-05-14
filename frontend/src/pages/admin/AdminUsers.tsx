import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  XCircle,
} from 'lucide-react';
import { KpiTile, SectionCard } from '@/components/admin/primitives';
import { DailyBars } from '@/components/admin/primitives';
import { formatDate } from '@/components/admin/helpers';
import apiClient from '@/lib/api-client';
import type { AdminOutletContext, UserRow } from '@/components/admin/types';

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? 'bg-gray-100 text-gray-800'
      }`}
    >
      {status}
    </span>
  );
}

export default function AdminUsers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useOutletContext<AdminOutletContext>();
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

  const { users, users_list } = data;
  const sortedUsers = sortUsers(users_list, sortKey, sortDir);

  return (
    <div className="flex flex-col w-full py-6 px-6 md:px-8 lg:px-10 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
      <header>
        <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold text-text-primary">
          {t('admin.nav.users')}
        </h1>
        <p className="text-xs text-text-tertiary mt-1">{t('admin.usersPage.subtitle')}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(0.5rem,1vw,1rem)]">
        <KpiTile
          id="kpi-u-total"
          label={t('admin.totalUsers')}
          icon={Users}
          info={t('admin.tooltips.totalUsers')}
          numericValue={users.total}
        />
        <KpiTile
          id="kpi-u-approved"
          label={t('admin.approved')}
          icon={CheckCircle2}
          info={t('admin.tooltips.approved')}
          tone="good"
          numericValue={users.approved}
          progressFraction={users.total ? users.approved / users.total : 0}
        />
        <KpiTile
          id="kpi-u-pending"
          label={t('admin.pending')}
          icon={Clock}
          info={t('admin.tooltips.pending')}
          tone={users.pending > 0 ? 'warning' : 'neutral'}
          numericValue={users.pending}
        />
        <KpiTile
          id="kpi-u-rejected"
          label={t('admin.usersPage.rejected')}
          icon={XCircle}
          info={t('admin.tooltips.rejected')}
          numericValue={users.rejected}
        />
      </div>

      <SectionCard
        title={t('admin.signups30d')}
        info={t('admin.tooltips.signups30d')}
        icon={Users}
      >
        <DailyBars data={users.recent_signups} color="hsl(158 70% 28%)" />
        <p className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-text-secondary mt-1 tabular-nums">
          {users.recent_signups.reduce((s, d) => s + d.count, 0)} {t('admin.inLast30Days')}
        </p>
      </SectionCard>

      <SectionCard
        title={t('admin.userManagement')}
        info={t('admin.tooltips.userManagement')}
        icon={Users}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[clamp(0.625rem,1.2vw,0.75rem)]">
            <thead>
              <tr className="border-b text-left text-text-secondary">
                {(
                  [
                    ['email', t('admin.email')],
                    ['display_name', t('admin.name')],
                    ['company_name', t('admin.company')],
                    ['role', t('admin.role')],
                    ['approval_status', t('admin.status')],
                    ['created_at', t('admin.registered')],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
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
                <tr
                  key={u.id}
                  className="border-b border-border-subtle hover:bg-surface-secondary/50 transition-colors"
                >
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
  );
}
