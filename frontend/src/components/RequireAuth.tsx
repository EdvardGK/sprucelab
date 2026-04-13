import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchMe } from '../lib/me';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  const { data: me, isLoading: meLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!user,
    retry: false,
    staleTime: 30_000,
  });

  if (authLoading || (user && meLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)]">
        <p className="text-sm text-[var(--text-muted,#6b7280)]">Laster...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)] px-4">
        <div className="max-w-sm rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          Kunne ikke hente brukerstatus. Prøv å logge inn på nytt.
        </div>
      </div>
    );
  }

  if (me?.profile?.approval_status !== 'approved') {
    return <Navigate to="/welcome" replace />;
  }

  return <>{children}</>;
}
