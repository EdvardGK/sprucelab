import { useMemo } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { ProjectFilterProvider } from '@/contexts/ProjectFilterProvider';
import { useProjectFilterUrl } from '@/hooks/useProjectFilterUrl';

/**
 * Project layout shell — mounts `<ProjectFilterProvider />` once for every
 * `/projects/:id/*` route so navigating between Dashboard, Viewer, Types,
 * etc. keeps a single shared filter store. Also mounts the URL-sync hook
 * (`?d=<base64>`).
 *
 * Future home for the project-level sidebar / tabs (Phase 6 sidebar
 * cleanup).
 */
function ProjectFilterUrlSync() {
  useProjectFilterUrl();
  return null;
}

export default function ProjectShell() {
  const { id } = useParams<{ id: string }>();
  const seed = useMemo(() => (id ? { project_id: id } : null), [id]);

  if (!seed) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <ProjectFilterProvider seed={seed}>
      <ProjectFilterUrlSync />
      <Outlet />
    </ProjectFilterProvider>
  );
}
