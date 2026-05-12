import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Folder,
  Search,
  Plus,
  Settings,
  HelpCircle,
  BarChart3,
  User,
  Layers,
  FileStack,
  Image,
  Box,
  Bug,
  Webhook,
  ShieldCheck,
  PenLine,
  ClipboardList,
  SlidersHorizontal,
  LogOut,
  Globe,
  PanelLeftClose,
  PanelLeft,
  Layers3,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { useProject } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { languages, type LanguageCode } from '@/i18n';

const COLLAPSED_STORAGE_KEY = 'sprucelab.sidebar.collapsed';

interface NavItemSpec {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Used when the route matches a prefix beyond `to` (e.g. /viewer/:id under /viewer-groups). */
  matchPrefixes?: string[];
}

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  });

  // Persist collapse state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // cmd+B (mac) / ctrl+B to toggle collapse
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        // Don't intercept inside inputs/textareas/contenteditable
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Detect project context from URL
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const workbenchView = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('view') || 'dashboard';
  }, [location.search]);

  const { data: currentProject } = useProject(projectId || '');

  const isActive = (path: string, prefixes?: string[]) => {
    if (path === '/') return location.pathname === '/';
    if (location.pathname === path) return true;
    if (location.pathname.startsWith(`${path}/`)) return true;
    if (prefixes) {
      return prefixes.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
    }
    return false;
  };

  // Fixed top nav: always available regardless of project context
  const topNav: NavItemSpec[] = [
    { to: '/my-page', icon: User, label: t('nav.myPage') },
    { to: '/projects', icon: Folder, label: t('nav.projects') },
  ];

  // Project items: only render when a project is active
  const projectNav: NavItemSpec[] | null = projectId && currentProject ? [
    { to: `/projects/${projectId}/dashboard`, icon: BarChart3, label: t('nav.dashboard') },
    {
      to: `/projects/${projectId}/viewer-groups`,
      icon: Box,
      label: t('nav.viewer3d'),
      matchPrefixes: [`/projects/${projectId}/viewer`],
    },
    { to: `/projects/${projectId}/models`, icon: Layers, label: t('nav.models') },
    { to: `/projects/${projectId}/floors`, icon: Layers3, label: t('nav.floors') },
    { to: `/projects/${projectId}/types`, icon: FileText, label: t('nav.types'), matchPrefixes: [`/projects/${projectId}/type-library`] },
    { to: `/projects/${projectId}/material-library`, icon: Box, label: t('nav.materialLibrary') },
    { to: `/projects/${projectId}/drawings`, icon: Image, label: t('nav.drawings') },
    { to: `/projects/${projectId}/documents`, icon: FileStack, label: t('nav.documents') },
    { to: `/projects/${projectId}/eir`, icon: SlidersHorizontal, label: t('nav.projectConfig') },
    { to: `/projects/${projectId}/field`, icon: ClipboardList, label: t('nav.fieldChecklists') },
  ] : null;

  // Workbench sub-routes (only when in project context). Active state pivots on ?view=.
  const workbenchNav = projectId && currentProject ? [
    {
      to: `/projects/${projectId}/workbench?view=verification`,
      basePath: `/projects/${projectId}/workbench`,
      view: 'verification',
      icon: ShieldCheck,
      label: t('workbench.verification'),
    },
    {
      to: `/projects/${projectId}/workbench?view=ifc-editing`,
      basePath: `/projects/${projectId}/workbench`,
      view: 'ifc-editing',
      icon: PenLine,
      label: t('workbench.ifcEditing'),
    },
  ] : null;

  // Tools section: always present
  const toolsNav: NavItemSpec[] = [
    { to: '/dev/processing-reports', icon: Bug, label: t('nav.processingReports') },
    { to: '/settings/webhooks', icon: Webhook, label: t('nav.webhooks') },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card transition-[width] duration-150',
          collapsed ? 'w-[3.5rem]' : 'w-64',
        )}
        aria-label="Primary navigation"
      >
        {/* Workspace header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-xs font-medium text-primary-foreground"
            aria-label="Go to workspace home"
          >
            SF
          </button>
          {!collapsed && (
            <span className="flex-1 truncate text-sm text-foreground">Spruce Forge</span>
          )}
          <SidebarIconButton
            icon={collapsed ? PanelLeft : PanelLeftClose}
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
            collapsed={collapsed && false /* keep button visible in both modes */}
          />
        </div>

        {/* Search + create */}
        {!collapsed ? (
          <div className="flex items-center gap-1 border-b border-border px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 flex-1 justify-start gap-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={t('common.search')}
              onClick={() => {
                if (import.meta.env.DEV) console.log('Search clicked - feature coming soon');
              }}
            >
              <Search className="h-4 w-4" />
              <span className="text-sm">{t('common.search')}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label="Create new"
              onClick={() => setCreateProjectOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 border-b border-border px-1 py-2">
            <SidebarIconButton icon={Search} label={t('common.search')} onClick={() => { /* search */ }} collapsed />
            <SidebarIconButton icon={Plus} label="Create" onClick={() => setCreateProjectOpen(true)} collapsed />
          </div>
        )}

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-1' : 'px-2')}>
          {/* Fixed top section: always available */}
          <SidebarSection collapsed={collapsed}>
            {topNav.map((item) => (
              <SidebarItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                active={isActive(item.to, item.matchPrefixes)}
                collapsed={collapsed}
              />
            ))}
          </SidebarSection>

          {/* Current project: conditional items, stable section position */}
          <SidebarSection
            collapsed={collapsed}
            label={t('nav.currentProject')}
            secondaryLabel={currentProject?.name}
          >
            {projectNav ? (
              projectNav.map((item) => (
                <SidebarItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.to, item.matchPrefixes)}
                  collapsed={collapsed}
                />
              ))
            ) : (
              !collapsed && (
                <p className="px-3 py-1 text-[0.7rem] text-muted-foreground/70">
                  {t('nav.pickProjectHint')}
                </p>
              )
            )}
          </SidebarSection>

          {/* Workbench: still under current project, but its own header for clarity */}
          {workbenchNav && (
            <SidebarSection collapsed={collapsed} label={t('workbench.title')}>
              {workbenchNav.map((item) => {
                const active = location.pathname.startsWith(item.basePath) && workbenchView === item.view;
                return (
                  <SidebarItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    active={active}
                    collapsed={collapsed}
                  />
                );
              })}
            </SidebarSection>
          )}

          {/* Tools: always available */}
          <SidebarSection collapsed={collapsed} label={t('nav.tools')}>
            {toolsNav.map((item) => (
              <SidebarItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                active={isActive(item.to, item.matchPrefixes)}
                collapsed={collapsed}
              />
            ))}
          </SidebarSection>
        </nav>

        {/* Footer: single user menu trigger */}
        <div className="border-t border-border p-2">
          <SidebarUserMenu collapsed={collapsed} />
        </div>

        <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
      </aside>
    </TooltipProvider>
  );
}

// Section: label rendered single-case, weight/color hierarchy only.
interface SidebarSectionProps {
  label?: string;
  secondaryLabel?: string;
  collapsed?: boolean;
  children: ReactNode;
}

function SidebarSection({ label, secondaryLabel, collapsed, children }: SidebarSectionProps) {
  return (
    <div className="mb-4">
      {!collapsed && label && (
        <div className="flex items-baseline gap-2 px-3 pb-1 pt-1">
          <span className="text-[0.7rem] text-muted-foreground">{label}</span>
          {secondaryLabel && (
            <span className="truncate text-[0.7rem] text-muted-foreground/70" title={secondaryLabel}>
              · {secondaryLabel}
            </span>
          )}
        </div>
      )}
      <div className={cn('flex flex-col', collapsed ? 'gap-1 items-center' : 'gap-px')}>
        {children}
      </div>
    </div>
  );
}

// Item: no background pill on active; subtle text color/weight only.
interface SidebarItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
}

function SidebarItem({ to, icon: Icon, label, active, collapsed }: SidebarItemProps) {
  const className = cn(
    'flex items-center rounded-md text-sm transition-colors',
    collapsed
      ? 'h-9 w-9 justify-center'
      : 'gap-3 px-3 py-1.5',
    active
      ? 'text-primary font-medium'
      : 'text-muted-foreground hover:text-foreground',
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to={to} className={className} aria-label={label} aria-current={active ? 'page' : undefined}>
            <Icon className="h-4 w-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link to={to} className={className} aria-current={active ? 'page' : undefined}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

// Icon button used in top header (search, plus, panel toggle).
interface SidebarIconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  collapsed?: boolean;
}

function SidebarIconButton({ icon: Icon, label, onClick, collapsed }: SidebarIconButtonProps) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

// User menu: single trigger, language/help/sign-out collapsed inside.
interface SidebarUserMenuProps {
  collapsed?: boolean;
}

function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();

  const displayName =
    (user?.user_metadata as { display_name?: string; first_name?: string } | undefined)?.display_name ||
    (user?.user_metadata as { first_name?: string } | undefined)?.first_name ||
    user?.email?.split('@')[0] ||
    'User';
  const email = user?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const trigger = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={displayName}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[0.7rem] font-medium text-primary-foreground">
            {initial}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{displayName}</TooltipContent>
    </Tooltip>
  ) : (
    <button
      type="button"
      aria-label="User menu"
      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[0.7rem] font-medium text-primary-foreground">
        {initial}
      </span>
      <span className="flex-1 truncate text-left text-foreground">{displayName}</span>
      <Settings className="h-4 w-4" />
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-sm font-medium text-foreground">{displayName}</span>
          {email && (
            <span className="truncate text-[0.7rem] text-muted-foreground">{email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="mr-2 h-4 w-4" />
            <span>{t('common.language')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={i18n.language}
                onValueChange={(v) => i18n.changeLanguage(v as LanguageCode)}
              >
                {languages.map((lang) => (
                  <DropdownMenuRadioItem key={lang.code} value={lang.code}>
                    <span className="mr-2">{lang.flag}</span>
                    {lang.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            if (import.meta.env.DEV) console.log('Help clicked - feature coming soon');
          }}
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>{t('common.help')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            try {
              await signOut();
            } catch (err) {
              if (import.meta.env.DEV) console.error('Sign out failed', err);
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('common.signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

