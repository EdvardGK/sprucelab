import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchMe, updateMyProfile } from '../lib/me';
import { useAuth } from '../contexts/AuthContext';
import { initBlueprintCity } from '../components/welcome/BlueprintCityScene';
import './Welcome.css';

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} · ${hh}:${mm}`;
}

function firstNameFrom(email: string | undefined, displayName: string | undefined): string {
  if (displayName && displayName.trim()) {
    return displayName.trim().split(/\s+/)[0];
  }
  if (email) return email.split('@')[0];
  return '';
}

const DEV_PREVIEW =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('preview') === '1';

const DEV_PREVIEW_USER = { email: 'preview@sprucelab.io' } as any;
const DEV_PREVIEW_ME: any = {
  profile: {
    display_name: 'Edvard',
    approval_status: 'pending',
    created_at: new Date().toISOString(),
    signup_metadata: {},
  },
};

export default function Welcome() {
  const { user: realUser, loading: realAuthLoading, signOut } = useAuth();
  const user = DEV_PREVIEW ? DEV_PREVIEW_USER : realUser;
  const authLoading = DEV_PREVIEW ? false : realAuthLoading;
  const queryClient = useQueryClient();
  const sceneContainerRef = useRef<HTMLDivElement>(null);

  const { data: meReal } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!user && !DEV_PREVIEW,
    refetchInterval: 15_000,
  });
  const me = DEV_PREVIEW ? DEV_PREVIEW_ME : meReal;

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

  // Three.js scene mount
  useEffect(() => {
    const container = sceneContainerRef.current;
    if (!container) return;
    const cleanup = initBlueprintCity(container);
    return cleanup;
  }, []);

  const saveProfile = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (next) => {
      queryClient.setQueryData(['me'], next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    },
  });

  if (authLoading) {
    return (
      <div className="welcome-root">
        <div className="welcome-frame" style={{ justifyItems: 'center', alignItems: 'center' }}>
          <p className="welcome-loading">Laster…</p>
        </div>
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
  const fornavn = firstNameFrom(user.email, me?.profile?.display_name);
  const registeredAt = me?.profile?.created_at ?? null;
  const emailDisplay = user.email ?? '';

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveProfile.mutate({
      signup_metadata: { role, use_case: useCase },
    });
  };

  return (
    <div className={`welcome-root ${isRejected ? 'welcome-rejected' : ''}`}>
      <div ref={sceneContainerRef} className="welcome-scene" aria-hidden="true" />
      <div className="welcome-veil" aria-hidden="true" />

      <div className="welcome-frame">
        <header className="welcome-header">
          <div className="welcome-wordmark">Sprucelab</div>
          <button
            type="button"
            className="welcome-signout"
            onClick={() => signOut()}
          >
            Logg ut
          </button>
        </header>

        <main className="welcome-main">
          {isRejected ? (
            <section className="welcome-panel">
              <div className="welcome-tag">Søknad · Ikke godkjent</div>
              <h1 className="welcome-heading">Søknaden din ble ikke godkjent</h1>
              <p className="welcome-lede">
                Takk for interessen i Sprucelab. Dersom du mener dette er en feil,
                ta kontakt på <em>hei@sprucelab.io</em> så ser vi på saken.
              </p>
            </section>
          ) : (
            <section className="welcome-panel">
              <div className="welcome-tag">Beta · Invitasjonsbasert</div>
              <h1 className="welcome-heading">
                Takk{fornavn ? `, ${fornavn}` : ''}.
              </h1>
              <p className="welcome-lede">
                Sprucelab er i lukket beta. Vi åpner tilgang manuelt for hver konto
                de første ukene — så vi får møte deg, ikke bare e-posten din.
              </p>

              <ol className="welcome-timeline">
                <li className="welcome-step done">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Registrert</span>
                  <span className="welcome-step-meta">{formatTimestamp(registeredAt)}</span>
                </li>
                <li className="welcome-step current">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Søknad til godkjenning</span>
                  <span className="welcome-step-meta">Vi vurderer nå</span>
                </li>
                <li className="welcome-step">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Tilgang åpnes</span>
                  <span className="welcome-step-meta">Siden laster automatisk</span>
                </li>
                <li className="welcome-step">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Første innlogging</span>
                  <span className="welcome-step-meta">Kom i gang</span>
                </li>
              </ol>

              <details className="welcome-more">
                <summary className="welcome-more-summary">
                  Fortell oss hva du vil bruke Sprucelab til
                </summary>
                <form className="welcome-form" onSubmit={handleSave}>
                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="welcome-role">
                      Rolle
                    </label>
                    <input
                      id="welcome-role"
                      type="text"
                      className="welcome-input"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="BIM-koordinator, prosjektleder, …"
                      autoComplete="organization-title"
                    />
                  </div>

                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="welcome-usecase">
                      Bruksområde
                    </label>
                    <textarea
                      id="welcome-usecase"
                      className="welcome-textarea"
                      value={useCase}
                      onChange={(e) => setUseCase(e.target.value)}
                      placeholder="Hvilke IFC-modeller jobber du med? Hva håper du Sprucelab løser?"
                      rows={3}
                    />
                  </div>

                  <div className="welcome-submit-row">
                    <button
                      type="submit"
                      className="welcome-submit"
                      disabled={saveProfile.isPending}
                    >
                      {saveProfile.isPending ? 'Lagrer…' : 'Lagre notat'}
                    </button>
                    {saved && <span className="welcome-saved">Lagret</span>}
                  </div>
                </form>
              </details>
            </section>
          )}
        </main>

        <footer className="welcome-footer">
          <div className="welcome-meta">
            <span>{emailDisplay}</span>
            <span>{isLoading ? 'Status: henter…' : `Kø-ID · ${me?.profile?.supabase_id?.slice(0, 8) ?? '—'}`}</span>
          </div>
          <div className="welcome-coords">
            <div>sprucelab.io / welcome</div>
            <div>{formatTimestamp(new Date().toISOString())}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
