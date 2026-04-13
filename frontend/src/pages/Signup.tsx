import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Signup() {
  const { user, loading, signUpWithPassword, error } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)]">
        <p className="text-sm text-[var(--text-muted,#6b7280)]">Laster...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/welcome" replace />;
  }

  const displayError = localError ?? error;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('Passord må være minst 8 tegn.');
      return;
    }
    setPending(true);
    try {
      const result = await signUpWithPassword({
        email,
        password,
        displayName,
        companyName,
      });
      if (result.needsConfirmation) {
        setNeedsConfirmation(true);
      } else {
        navigate('/welcome', { replace: true });
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Registrering feilet');
    } finally {
      setPending(false);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)] px-4">
        <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle,#e5e7eb)] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[var(--text-primary,#111827)]">
            Bekreft e-posten din
          </h1>
          <p className="mt-3 text-sm text-[var(--text-muted,#6b7280)]">
            Vi har sendt en bekreftelseslenke til <strong>{email}</strong>. Klikk lenken for å
            fullføre registreringen.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-xs font-medium text-[var(--text-primary,#111827)] underline"
          >
            Tilbake til innlogging
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)] px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle,#e5e7eb)] bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary,#111827)]">
            Opprett konto
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted,#6b7280)]">
            Sprucelab er for øyeblikket i lukket beta. Etter registrering må kontoen din godkjennes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-[var(--text-muted,#6b7280)]">
            Navn
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-3 py-2 text-sm text-[var(--text-primary,#111827)] shadow-sm focus:border-[var(--border-strong,#9ca3af)] focus:outline-none"
            />
          </label>

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

          <label className="block text-xs font-medium text-[var(--text-muted,#6b7280)]">
            Passord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-3 py-2 text-sm text-[var(--text-primary,#111827)] shadow-sm focus:border-[var(--border-strong,#9ca3af)] focus:outline-none"
            />
            <span className="mt-1 block text-[10px] font-normal text-[var(--text-muted,#6b7280)]">
              Minst 8 tegn.
            </span>
          </label>

          <label className="block text-xs font-medium text-[var(--text-muted,#6b7280)]">
            Firma <span className="font-normal">(valgfritt)</span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoComplete="organization"
              className="mt-1 w-full rounded-md border border-[var(--border-subtle,#e5e7eb)] bg-white px-3 py-2 text-sm text-[var(--text-primary,#111827)] shadow-sm focus:border-[var(--border-strong,#9ca3af)] focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-md bg-[var(--text-primary,#111827)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Oppretter...' : 'Opprett konto'}
          </button>
        </form>

        {displayError && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {displayError}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-muted,#6b7280)]">
          Har du allerede en konto?{' '}
          <Link to="/login" className="font-medium text-[var(--text-primary,#111827)] underline">
            Logg inn
          </Link>
        </p>
      </div>
    </div>
  );
}
