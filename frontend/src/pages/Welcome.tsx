import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchMe, updateMyProfile } from '../lib/me';
import { useAuth } from '../contexts/AuthContext';
import { initDioramaScene } from '../components/welcome/DioramaScene';
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

  const { data: meReal, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: !!user && !DEV_PREVIEW,
    refetchInterval: 15_000,
  });
  const me = DEV_PREVIEW ? DEV_PREVIEW_ME : meReal;
  const isLoading = DEV_PREVIEW ? false : meLoading;

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

  // Three.js scene mount — `?scene=diorama` opts into the architect-diorama variant,
  // otherwise the default BlueprintCity scene renders.
  useEffect(() => {
    const container = sceneContainerRef.current;
    if (!container) return;
    const sceneParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('scene')
        : null;
    const cleanup =
      sceneParam === 'city'
        ? initBlueprintCity(container)
        : initDioramaScene(container);
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
          <p className="welcome-loading">Loading…</p>
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
            Sign out
          </button>
        </header>

        <main className="welcome-main">
          {isRejected ? (
            <section className="welcome-panel">
              <div className="welcome-tag">Application · Not approved</div>
              <h1 className="welcome-heading">Your application wasn't approved</h1>
              <p className="welcome-lede">
                Thanks for your interest in Sprucelab. If you think this is a
                mistake, reach out at <em>hi@sprucelab.io</em> and we'll take
                another look.
              </p>
            </section>
          ) : (
            <section className="welcome-panel">
              <div className="welcome-tag">Beta · Invitation only</div>
              <h1 className="welcome-heading">
                Thanks{fornavn ? `, ${fornavn}` : ''}.
              </h1>
              <p className="welcome-lede">
                Sprucelab is in closed beta. We're opening access manually for
                each account during the first weeks — so we get to meet you,
                not just your email address.
              </p>

              <ol className="welcome-timeline">
                <li className="welcome-step done">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Registered</span>
                  <span className="welcome-step-meta">{formatTimestamp(registeredAt)}</span>
                </li>
                <li className="welcome-step current">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Under review</span>
                  <span className="welcome-step-meta">Reviewing now</span>
                </li>
                <li className="welcome-step">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">Access granted</span>
                  <span className="welcome-step-meta">Page refreshes automatically</span>
                </li>
                <li className="welcome-step">
                  <span className="welcome-step-dot" aria-hidden="true" />
                  <span className="welcome-step-label">First sign-in</span>
                  <span className="welcome-step-meta">Get started</span>
                </li>
              </ol>

              <details className="welcome-more">
                <summary className="welcome-more-summary">
                  Tell us what you'd use Sprucelab for
                </summary>
                <form className="welcome-form" onSubmit={handleSave}>
                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="welcome-role">
                      Role
                    </label>
                    <input
                      id="welcome-role"
                      type="text"
                      className="welcome-input"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="BIM coordinator, project lead, …"
                      autoComplete="organization-title"
                    />
                  </div>

                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="welcome-usecase">
                      Use case
                    </label>
                    <textarea
                      id="welcome-usecase"
                      className="welcome-textarea"
                      value={useCase}
                      onChange={(e) => setUseCase(e.target.value)}
                      placeholder="What IFC models are you working with? What do you hope Sprucelab solves for you?"
                      rows={3}
                    />
                  </div>

                  <div className="welcome-submit-row">
                    <button
                      type="submit"
                      className="welcome-submit"
                      disabled={saveProfile.isPending}
                    >
                      {saveProfile.isPending ? 'Saving…' : 'Save note'}
                    </button>
                    {saved && <span className="welcome-saved">Saved</span>}
                  </div>
                </form>
              </details>
            </section>
          )}
        </main>

        <footer className="welcome-footer">
          <div className="welcome-meta">
            <span>{emailDisplay}</span>
            <span>{isLoading ? 'Status: fetching…' : `Queue ID · ${me?.profile?.supabase_id?.slice(0, 8) ?? '—'}`}</span>
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
