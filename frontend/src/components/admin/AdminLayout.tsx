import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  LayoutDashboard,
  Activity,
  ScrollText,
  Webhook,
  Server,
  Users,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * AdminLayout — replaces the regular AppLayout for the entire `/admin/*`
 * subtree. Slim left rail with admin scopes (Overview, Processing, Logs,
 * Webhooks, System, Users), then the route Outlet area.
 *
 * Why its own layout: admin is a control center for separate scopes, not
 * a feature inside the main app. Bundling it into the project sidebar
 * mixes concerns and clutters daily nav.
 */

interface AdminNavItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  /** True iff this is the index path. */
  end?: boolean;
}

const NAV: AdminNavItem[] = [
  { to: '/admin', icon: LayoutDashboard, labelKey: 'admin.nav.overview', end: true },
  { to: '/admin/processing', icon: Activity, labelKey: 'admin.nav.processing' },
  { to: '/admin/logs', icon: ScrollText, labelKey: 'admin.nav.logs' },
  { to: '/admin/webhooks', icon: Webhook, labelKey: 'admin.nav.webhooks' },
  { to: '/admin/system', icon: Server, labelKey: 'admin.nav.system' },
  { to: '/admin/users', icon: Users, labelKey: 'admin.nav.users' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-[clamp(11rem,14vw,14rem)] shrink-0 border-r border-border-subtle bg-surface-secondary/30 flex flex-col">
        {/* Brand + back-to-app */}
        <div className="px-3 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">{t('admin.title')}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate('/projects')}
                className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                {t('admin.nav.backToApp')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('admin.nav.backToAppTip')}</TooltipContent>
          </Tooltip>
        </div>

        {/* Section nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5 px-2">
            {NAV.map(({ to, icon: Icon, labelKey, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-surface-primary text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-primary/60',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer slot — kept empty for now; could surface staff email later */}
        <div className="px-3 py-2 border-t border-border-subtle text-[10px] text-text-tertiary">
          {t('admin.nav.scopeNote')}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
