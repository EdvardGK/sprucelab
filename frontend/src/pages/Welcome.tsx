import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchMe, updateMyProfile } from '../lib/me';
import { useAuth } from '../contexts/AuthContext';

export default function Welcome() {
  const { user, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data: me, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const [role, setRole] = useState('');
  const [useCase, setUseCase] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const meta = me?.profile?.signup_metadata as Record<string, string> | undefined;
    if (meta) {
      if (typeof meta.role === 'string') setRole(meta.role);
      if (typeof meta.use_case === 'string') setUseCase(meta.use_case);
    }
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (next) => {
      queryClient.setQueryData(['me'], next);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Laster...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (me?.profile?.approval_status === 'approved') {
    return <Navigate to="/" replace />;
  }

  const isRejected = me?.profile?.approval_status === 'rejected';

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveProfile.mutate({
      signup_metadata: { role, use_case: useCase },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isRejected ? 'Søknad avvist' : 'Takk for registreringen'}
        </h1>

        {isRejected ? (
          <p className="mt-3 text-sm text-slate-500">
            Søknaden din ble dessverre ikke godkjent. Ta kontakt hvis du mener dette er en feil.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-500">
              Sprucelab er i lukket beta. Kontoen din venter på godkjenning — du får beskjed på
              e-post når du er innlogget.
            </p>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">
                Fortell oss litt mer
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Valgfritt. Hjelper oss å prioritere søknaden din.
              </p>

              <form onSubmit={handleSave} className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-slate-600">
                  Rolle
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="BIM-koordinator, prosjektleder, ..."
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  Hva vil du bruke Sprucelab til?
                  <textarea
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    rows={3}
                    placeholder="Beskriv kort hva du ønsker å oppnå"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={saveProfile.isPending}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveProfile.isPending ? 'Lagrer...' : 'Lagre'}
                </button>

                {saved && (
                  <p className="text-xs text-emerald-700">Lagret.</p>
                )}
              </form>
            </div>
          </>
        )}

        {isLoading && (
          <p className="mt-4 text-xs text-slate-500">Henter status...</p>
        )}
        {error && (
          <p className="mt-4 text-xs text-red-700">
            Kunne ikke hente status: {error instanceof Error ? error.message : 'ukjent feil'}
          </p>
        )}

        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-slate-500 underline"
          >
            Logg ut
          </button>
        </div>
      </div>
    </div>
  );
}
