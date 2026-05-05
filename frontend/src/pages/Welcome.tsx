import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
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

const DEV_PREVIEW_VARIANTS = ['anon', 'pending', 'rejected', 'sent'] as const;
type PreviewVariant = (typeof DEV_PREVIEW_VARIANTS)[number];
const DEV_PREVIEW_VARIANT: PreviewVariant | null = (() => {
  if (!DEV_PREVIEW || typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('variant');
  return DEV_PREVIEW_VARIANTS.includes(v as PreviewVariant)
    ? (v as PreviewVariant)
    : 'pending';
})();

const DEV_PREVIEW_USER = { email: 'preview@sprucelab.io' } as any;
const DEV_PREVIEW_ME: any = {
  profile: {
    display_name: 'Edvard',
    approval_status: DEV_PREVIEW_VARIANT === 'rejected' ? 'rejected' : 'pending',
    created_at: new Date().toISOString(),
    signup_metadata: {},
  },
};

export default function Welcome() {
  const {
    user: realUser,
    loading: realAuthLoading,
    signOut,
    signUpWithPassword,
    error: authError,
  } = useAuth();

  const previewAnon = DEV_PREVIEW && (DEV_PREVIEW_VARIANT === 'anon' || DEV_PREVIEW_VARIANT === 'sent');
  const user = DEV_PREVIEW
    ? previewAnon
      ? null
      : DEV_PREVIEW_USER
    : realUser;
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

  // === Signup form (anonymous state) ===
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupCompany, setSignupCompany] = useState('');
  const [signupPending, setSignupPending] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(
    DEV_PREVIEW_VARIANT === 'sent',
  );

  // === Profile note (pending state) ===
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

  // Three.js diorama mounts once and lives across all visitor states.
  useEffect(() => {
    const container = sceneContainerRef.current;
    if (!container) return;
    const cleanup = initDioramaScene(container);
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

  // Approved users skip the landing entirely.
  if (user && me?.profile?.approval_status === 'approved') {
    return <Navigate to="/projects" replace />;
  }

  const isRejected = user && me?.profile?.approval_status === 'rejected';
  const fornavn = user ? firstNameFrom(user.email, me?.profile?.display_name) : '';
  const registeredAt = me?.profile?.created_at ?? null;
  const emailDisplay = user?.email ?? '';

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    saveProfile.mutate({
      signup_metadata: { role, use_case: useCase },
    });
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.');
      return;
    }
    setSignupPending(true);
    try {
      const result = await signUpWithPassword({
        email: signupEmail,
        password: signupPassword,
        firstName: signupFirstName,
        lastName: signupLastName,
        companyName: signupCompany,
      });
      if (result.needsConfirmation) {
        setNeedsConfirmation(true);
      }
      // If no confirmation needed, the auth context will flip `user` and
      // we'll re-render into the pending-approval state automatically.
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setSignupPending(false);
    }
  };

  const renderHeaderRight = () => {
    if (user) {
      return (
        <button type="button" className="welcome-signout" onClick={() => signOut()}>
          Sign out
        </button>
      );
    }
    return (
      <Link to="/login" className="welcome-signout">
        Sign in
      </Link>
    );
  };

  // === Anonymous: signup form panel ===
  if (!user) {
    return (
      <div className="welcome-root">
        <div ref={sceneContainerRef} className="welcome-scene" aria-hidden="true" />
        <div className="welcome-veil" aria-hidden="true" />

        <div className="welcome-frame">
          <header className="welcome-header">
            <div className="welcome-wordmark">Sprucelab</div>
            {renderHeaderRight()}
          </header>

          <main className="welcome-main">
            {needsConfirmation ? (
              <section className="welcome-panel">
                <div className="welcome-tag">Beta · Check your email</div>
                <h1 className="welcome-heading">Confirm your address.</h1>
                <p className="welcome-lede">
                  We sent a confirmation link
                  {signupEmail ? <> to <em>{signupEmail}</em></> : null}. Click
                  it to finish signing up — then you'll join the review queue.
                </p>
                <p className="welcome-lede" style={{ marginTop: '0.5rem' }}>
                  Already confirmed?{' '}
                  <Link to="/login" className="welcome-inline-link">
                    Sign in
                  </Link>
                  .
                </p>
              </section>
            ) : (
              <section className="welcome-panel">
                <div className="welcome-tag">Beta · Invitation only</div>
                <h1 className="welcome-heading">Apply for access.</h1>
                <p className="welcome-lede">
                  Sprucelab is in closed beta — the data layer behind BIM
                  models you can actually query, diff, and verify. We open
                  access manually so we get to meet each new account.
                </p>

                <form className="welcome-form" onSubmit={handleSignup}>
                  <div className="welcome-field-row">
                    <div className="welcome-field">
                      <label className="welcome-field-label" htmlFor="signup-first">
                        First name
                      </label>
                      <input
                        id="signup-first"
                        type="text"
                        className="welcome-input"
                        value={signupFirstName}
                        onChange={(e) => setSignupFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="welcome-field">
                      <label className="welcome-field-label" htmlFor="signup-last">
                        Last name
                      </label>
                      <input
                        id="signup-last"
                        type="text"
                        className="welcome-input"
                        value={signupLastName}
                        onChange={(e) => setSignupLastName(e.target.value)}
                        required
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="signup-email">
                      Email
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      className="welcome-input"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="signup-password">
                      Password
                    </label>
                    <input
                      id="signup-password"
                      type="password"
                      className="welcome-input"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <span className="welcome-field-hint">At least 8 characters.</span>
                  </div>

                  <div className="welcome-field">
                    <label className="welcome-field-label" htmlFor="signup-company">
                      Company <span className="welcome-field-optional">(optional)</span>
                    </label>
                    <input
                      id="signup-company"
                      type="text"
                      className="welcome-input"
                      value={signupCompany}
                      onChange={(e) => setSignupCompany(e.target.value)}
                      autoComplete="organization"
                    />
                  </div>

                  <div className="welcome-submit-row">
                    <button
                      type="submit"
                      className="welcome-submit"
                      disabled={signupPending}
                    >
                      {signupPending ? 'Submitting…' : 'Apply for access'}
                    </button>
                    <span className="welcome-saved" style={{ visibility: 'hidden' }}>
                      placeholder
                    </span>
                  </div>

                  {(signupError || authError) && (
                    <div role="alert" className="welcome-alert">
                      {signupError ?? authError}
                    </div>
                  )}
                </form>

                <p className="welcome-lede" style={{ marginTop: '1.25rem', fontSize: '0.75rem' }}>
                  Already have an account?{' '}
                  <Link to="/login" className="welcome-inline-link">
                    Sign in
                  </Link>
                  .
                </p>
              </section>
            )}
          </main>

          <footer className="welcome-footer">
            <div className="welcome-meta">
              <span>Closed beta · invitation only</span>
              <span>{isLoading ? '' : 'Reviewed by hand · usually within 48h'}</span>
            </div>
            <div className="welcome-coords">
              <div>sprucelab.io / apply</div>
              <div>{formatTimestamp(new Date().toISOString())}</div>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // === Pending or rejected: queue/timeline panel (existing content) ===
  return (
    <div className={`welcome-root ${isRejected ? 'welcome-rejected' : ''}`}>
      <div ref={sceneContainerRef} className="welcome-scene" aria-hidden="true" />
      <div className="welcome-veil" aria-hidden="true" />

      <div className="welcome-frame">
        <header className="welcome-header">
          <div className="welcome-wordmark">Sprucelab</div>
          {renderHeaderRight()}
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
                <form className="welcome-form" onSubmit={handleSaveProfile}>
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
