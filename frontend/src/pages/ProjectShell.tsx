import { useMemo } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { ProjectFilterProvider } from '@/contexts/ProjectFilterProvider';
import { useProjectFilterUrl } from '@/hooks/useProjectFilterUrl';
import { useProjectFilterPersist } from '@/hooks/useProjectFilterPersist';

/**
 * Project layout shell — mounts `<ProjectFilterProvider />` once for every
 * `/projects/:id/*` route so navigating between Dashboard, Viewer, Types,
 * etc. keeps a single shared filter store. Also mounts the URL-sync hook
 * (`?d=<base64>`) + localStorage persist hook (`sprucelab-filter-v3`).
 *
 * The provider is keyed on the project id so React unmounts the subtree
 * when the user switches project — that resets the reducer state and
 * mirrors the old Zustand store's per-project `setScope` reset.
 *
 * Mount order: persist hook BEFORE url hook. Both run their hydrate
 * effects on first mount; the URL hook's `replace` dispatch wins because
 * it runs second. Effect: a `?d=` payload always overrides localStorage
 * (URLs are shareable; localStorage is per-machine).
 *
 * Future home for the project-level sidebar / tabs (Phase 6 sidebar
 * cleanup).
 */
function ProjectFilterSync() {
  useProjectFilterPersist();
  useProjectFilterUrl();
  return null;
}

export default function ProjectShell() {
  const { id } = useParams<{ id: string }>();
  const seed = useMemo(() => (id ? { project_id: id } : null), [id]);

  if (!seed || !id) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <ProjectFilterProvider key={id} seed={seed}>
      <ProjectFilterSync />
      <Outlet />
    </ProjectFilterProvider>
  );
}
