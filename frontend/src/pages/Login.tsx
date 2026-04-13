import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { user, loading, signInWithMicrosoft, error } = useAuth();
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)]">
        <p className="text-sm text-[var(--text-muted,#6b7280)]">Laster...</p>
      </div>
    );
  }

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const handleSignIn = async () => {
    setPending(true);
    setLocalError(null);
    try {
      await signInWithMicrosoft();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Innlogging feilet');
      setPending(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)] px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle,#e5e7eb)] bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary,#111827)]">Sprucelab</h1>
          <p className="mt-2 text-sm text-[var(--text-muted,#6b7280)]">
            Logg inn for å fortsette
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={pending}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary,#111827)] transition hover:bg-[var(--surface-hover,#f3f4f6)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
          </svg>
          <span>{pending ? 'Åpner Microsoft...' : 'Logg inn med Microsoft'}</span>
        </button>

        {displayError && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {displayError}
          </div>
        )}
      </div>
    </div>
  );
}
