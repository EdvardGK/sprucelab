import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'password' | 'magic';

export default function Login() {
  const { user, loading, signInWithPassword, signInWithMagicLink, error } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
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

  const displayError = localError ?? error;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setMagicSent(false);
    setPending(true);
    try {
      if (mode === 'password') {
        await signInWithPassword(email, password);
      } else {
        await signInWithMagicLink(email);
        setMagicSent(true);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Innlogging feilet');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)] px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle,#e5e7eb)] bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary,#111827)]">Sprucelab</h1>
          <p className="mt-2 text-sm text-[var(--text-muted,#6b7280)]">Logg inn for å fortsette</p>
        </div>

        <div className="mb-5 flex rounded-md border border-[var(--border-subtle,#e5e7eb)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('password');
              setMagicSent(false);
              setLocalError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
              mode === 'password'
                ? 'bg-[var(--surface-base,#f7f8fa)] text-[var(--text-primary,#111827)]'
                : 'text-[var(--text-muted,#6b7280)] hover:text-[var(--text-primary,#111827)]'
            }`}
          >
            Passord
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('magic');
              setMagicSent(false);
              setLocalError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
              mode === 'magic'
                ? 'bg-[var(--surface-base,#f7f8fa)] text-[var(--text-primary,#111827)]'
                : 'text-[var(--text-muted,#6b7280)] hover:text-[var(--text-primary,#111827)]'
            }`}
          >
            Magisk lenke
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-[var(--text-muted,#6b7280)]">
            E-post
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-3 py-2 text-sm text-[var(--text-primary,#111827)] shadow-sm focus:border-[var(--border-strong,#9ca3af)] focus:outline-none"
            />
          </label>

          {mode === 'password' && (
            <label className="block text-xs font-medium text-[var(--text-muted,#6b7280)]">
              Passord
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-3 py-2 text-sm text-[var(--text-primary,#111827)] shadow-sm focus:border-[var(--border-strong,#9ca3af)] focus:outline-none"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-md bg-[var(--text-primary,#111827)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? 'Sender...'
              : mode === 'password'
              ? 'Logg inn'
              : 'Send magisk lenke'}
          </button>
        </form>

        {magicSent && mode === 'magic' && (
          <div
            role="status"
            className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          >
            Magisk lenke sendt til {email}. Sjekk e-posten.
          </div>
        )}

        {displayError && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {displayError}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-muted,#6b7280)]">
          Ny bruker?{' '}
          <Link to="/signup" className="font-medium text-[var(--text-primary,#111827)] underline">
            Opprett konto
          </Link>
        </p>
      </div>
    </div>
  );
}
