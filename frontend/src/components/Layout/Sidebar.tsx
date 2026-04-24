import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Target,
  FileText,
  Folder,
  Search,
  Plus,
  ChevronDown,
  Settings,
  HelpCircle,
  BarChart3,
  Code,
  User,
  Layers,
  FileStack,
  Image,
  Box,
  Bug,
  ShieldCheck,
  PenLine,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { useProject } from '@/hooks/use-projects';
import { LanguageSelector } from '@/components/LanguageSelector';

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [developerOpen, setDeveloperOpen] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Detect if we're in a project context
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^\/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  // Get workbench view from URL search params (dashboard, library, classify, materials, stats)
  const workbenchView = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('view') || 'dashboard';
  }, [location.search]);

  const { data: currentProject } = useProject(projectId || '');

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="flex w-64 flex-col border-r border-white/30 bg-white/60 backdrop-blur-xl">
      {/* Workspace selector */}
      <div className="border-b border-white/30 p-3">
        <button
          onClick={() => navigate('/')}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface transition-colors"
          aria-label="Go to workspace home"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
            SF
          </div>
          <span className="flex-1 truncate text-left font-medium">Spruce Forge</span>
          <Home className="h-4 w-4 text-text-tertiary" />
        </button>
      </div>

      {/* Search and actions */}
      <div className="flex items-center gap-2 border-b border-white/30 p-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2"
          aria-label={t('common.search')}
          onClick={() => {
            console.log('Search clicked - feature coming soon');
          }}
        >
          <Search className="h-4 w-4" />
          <span className="text-text-secondary">{t('common.search')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Create new"
          onClick={() => setCreateProjectOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {/* Main navigation - only when NOT in project */}
        {!projectId && (
          <div className="mb-4 space-y-0.5">
            <Link
              to="/my-page"
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive('/my-page')
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary'
              )}
            >
              <User className="h-4 w-4" />
              <span>{t('nav.myPage')}</span>
            </Link>
          </div>
        )}

        {/* Project-specific navigation (only when in project context) */}
        {projectId && currentProject && (
          <div className="mb-4">
            <div className="px-3 py-1.5 text-xs text-text-tertiary font-medium truncate">
              {currentProject.name}
            </div>

            {/* User section */}
            <div className="mt-3 space-y-0.5">
              <Link
                to={`/projects/${projectId}/my-page`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  location.pathname === `/projects/${projectId}/my-page`
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <User className="h-4 w-4" />
                <span>{t('nav.myPage')}</span>
              </Link>

              {/* 3D Viewer link */}
              <Link
                to={`/projects/${projectId}/viewer-groups`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(`/projects/${projectId}/viewer-groups`) || isActive(`/projects/${projectId}/viewer/`)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <Box className="h-4 w-4" />
                <span>{t('nav.viewer3d')}</span>
              </Link>
            </div>

            {/* Project Overview */}
            <div className="mt-4 space-y-0.5">
              <Link
                to={`/projects/${projectId}`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  location.pathname === `/projects/${projectId}`
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <BarChart3 className="h-4 w-4" />
                <span>{t('nav.dashboard')}</span>
              </Link>
            </div>

            {/* Files section */}
            <div className="mt-4">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('nav.files')}
              </div>
              <div className="mt-1 space-y-0.5">
                <Link
                  to={`/projects/${projectId}/models`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    location.pathname === `/projects/${projectId}/models`
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <Layers className="h-4 w-4" />
                  <span>{t('nav.models')}</span>
                </Link>
                <Link
                  to={`/projects/${projectId}/drawings`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive(`/projects/${projectId}/drawings`)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <Image className="h-4 w-4" />
                  <span>{t('nav.drawings')}</span>
                </Link>
                <Link
                  to={`/projects/${projectId}/documents`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive(`/projects/${projectId}/documents`)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <FileStack className="h-4 w-4" />
                  <span>{t('nav.documents')}</span>
                </Link>
              </div>
            </div>

            {/* Data section */}
            <div className="mt-4">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('nav.data')}
              </div>
              <div className="mt-1 space-y-0.5">
                <Link
                  to={`/projects/${projectId}/types`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive(`/projects/${projectId}/types`) || isActive(`/projects/${projectId}/type-library`)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <FileText className="h-4 w-4" />
                  <span>{t('nav.types')}</span>
                </Link>
                <Link
                  to={`/projects/${projectId}/material-library`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive(`/projects/${projectId}/material-library`)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <Box className="h-4 w-4" />
                  <span>{t('nav.materialLibrary')}</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* BIM Workbench section */}
        {projectId && currentProject && (
          <div className="mb-4">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('workbench.title')}
            </div>
            <div className="mt-1 space-y-0.5">
              <Link
                to={`/projects/${projectId}/workbench?view=verification`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(`/projects/${projectId}/workbench`) && workbenchView === 'verification'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{t('workbench.verification')}</span>
              </Link>
              <Link
                to={`/projects/${projectId}/workbench?view=ifc-editing`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(`/projects/${projectId}/workbench`) && workbenchView === 'ifc-editing'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <PenLine className="h-4 w-4" />
                <span>{t('workbench.ifcEditing')}</span>
              </Link>
            </div>
          </div>
        )}

        {/* Field & Compliance section */}
        {projectId && currentProject && (
          <div className="mb-4">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('nav.field')}
            </div>
            <div className="mt-1 space-y-0.5">
              <Link
                to={`/projects/${projectId}/field`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(`/projects/${projectId}/field`)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <ClipboardList className="h-4 w-4" />
                <span>{t('nav.fieldChecklists')}</span>
              </Link>
            </div>
          </div>
        )}

        {/* Workspace section (only when NOT in project context) */}
        {!projectId && (
          <div className="mb-4">
          <button
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary hover:bg-surface transition-colors"
          >
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                !workspaceOpen && '-rotate-90'
              )}
            />
            <span>{t('nav.workspace')}</span>
          </button>

          {workspaceOpen && (
            <div className="mt-1 space-y-0.5">
              <Link
                to="/projects"
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 pl-8 text-sm transition-colors',
                  location.pathname === '/projects'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <Folder className="h-4 w-4" />
                <span>{t('nav.projects')}</span>
              </Link>
              <Link
                to="/scripts"
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 pl-8 text-sm transition-colors',
                  isActive('/scripts')
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <Code className="h-4 w-4" />
                <span>{t('nav.scriptsLibrary')}</span>
              </Link>
              <Link
                to="/stats"
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 pl-8 text-sm transition-colors',
                  isActive('/stats')
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <BarChart3 className="h-4 w-4" />
                <span>{t('nav.quickStats')}</span>
              </Link>
            </div>
          )}
          </div>
        )}

        {/* Developer section (only when NOT in project context) */}
        {!projectId && (
          <div className="mb-4">
          <button
            onClick={() => setDeveloperOpen(!developerOpen)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary hover:bg-surface transition-colors"
          >
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                !developerOpen && '-rotate-90'
              )}
            />
            <span>{t('nav.developer')}</span>
          </button>

          {developerOpen && (
            <div className="mt-1 space-y-0.5">
              <Link
                to="/dev/processing-reports"
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 pl-8 text-sm transition-colors',
                  isActive('/dev/processing-reports')
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <Bug className="h-4 w-4" />
                <span>{t('nav.processingReports')}</span>
              </Link>
            </div>
          )}
          </div>
        )}
      </nav>

      {/* User profile */}
      <div className="border-t border-border p-2">
        <button
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-surface transition-colors"
          aria-label="User menu"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            U
          </div>
          <span className="flex-1 truncate text-left text-text-primary">User</span>
          <Settings className="h-4 w-4 text-text-tertiary" />
        </button>

        <div className="mt-1 flex items-center gap-1">
          <LanguageSelector />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('common.settings')}
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('common.help')}
            onClick={() => {
              console.log('Help clicked - feature coming soon');
            }}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
      />
    </aside>
  );
}
