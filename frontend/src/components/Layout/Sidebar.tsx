import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  Wrench,
  FileStack,
  Image,
  Box,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { useProject } from '@/hooks/use-projects';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

const mainNavItems: NavItem[] = [
  { name: 'My Page', href: '/my-page', icon: <User className="h-4 w-4" /> },
  { name: 'My Issues', href: '/my-issues', icon: <Target className="h-4 w-4" /> },
  { name: 'My RFIs', href: '/my-rfis', icon: <FileText className="h-4 w-4" /> },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Detect if we're in a project context
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^\/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const { data: currentProject } = useProject(projectId || '');

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-background-elevated">
      {/* Workspace selector */}
      <div className="border-b border-border p-3">
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
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2"
          aria-label="Search"
          onClick={() => {
            // TODO: Implement search functionality
            console.log('Search clicked - feature coming soon');
          }}
        >
          <Search className="h-4 w-4" />
          <span className="text-text-secondary">Search</span>
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
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
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
                <span>My Page</span>
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
                <span>3D Viewer</span>
              </Link>
            </div>

            {/* Files section */}
            <div className="mt-4">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Files
              </div>
              <div className="mt-1 space-y-0.5">
                <Link
                  to={`/projects/${projectId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    location.pathname === `/projects/${projectId}`
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  <Layers className="h-4 w-4" />
                  <span>Models</span>
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
                  <span>Documents</span>
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
                  <span>Drawings</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Modules section (only when in project context) */}
        {projectId && currentProject && (
          <div className="mb-4">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Modules
            </div>
            <div className="mt-1 space-y-0.5">
              <Link
                to={`/projects/${projectId}/workbench`}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(`/projects/${projectId}/workbench`)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                <Wrench className="h-4 w-4" />
                <span>BIM Workbench</span>
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
            <span>Workspace</span>
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
                <span>Projects</span>
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
                <span>Scripts Library</span>
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
                <span>Quick Stats</span>
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Help"
            onClick={() => {
              // TODO: Implement help/documentation
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
