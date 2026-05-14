import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminLayout } from '@/components/admin/AdminLayout';
import apiClient from '@/lib/api-client';
import type { AdminStats, AdminOutletContext } from '@/components/admin/types';

/**
 * AdminShell — top-level wrapper for every `/admin/*` route. Fetches the
 * single aggregated `/api/admin/dashboard/` payload once, auto-refreshes
 * every 30 seconds, and hands it down to nested routes via Outlet context.
 *
 * The Tooltip provider lives here so InfoBadge tooltips work on every page.
 */
export default function AdminShell() {
  const { t } = useTranslation();

  const { data, isLoading, error, refetch } = useQuery<AdminStats>({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiClient.get('/admin/dashboard/').then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full text-text-secondary gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full text-red-600 gap-2">
          <AlertTriangle className="h-5 w-5" />
          {t('admin.accessDenied')}
        </div>
      </AdminLayout>
    );
  }

  const ctx: AdminOutletContext = { data, refetch };

  return (
    <AdminLayout>
      <TooltipProvider delayDuration={150}>
        <Outlet context={ctx} />
      </TooltipProvider>
    </AdminLayout>
  );
}
