import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Local dev only. When `VITE_DEV_AUTH_BYPASS=1` is set in the build env (see
// `.env.development`), Supabase is skipped entirely and a synthetic session
// is returned synchronously. Pair with backend `DEV_AUTH_BYPASS=1`.
export const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

const DEV_BYPASS_USER = {
  id: '00000000-0000-0000-0000-000000000dev',
  email: 'dev@local.test',
  app_metadata: {},
  user_metadata: { display_name: 'Dev (local bypass)' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
} as unknown as User;

const DEV_BYPASS_SESSION = {
  user: DEV_BYPASS_USER,
  access_token: 'dev-bypass',
  refresh_token: 'dev-bypass',
  token_type: 'bearer',
  expires_in: 86400 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
} as unknown as Session;

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signUpWithPassword: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(
    DEV_AUTH_BYPASS ? DEV_BYPASS_SESSION : null,
  );
  const [loading, setLoading] = useState(!DEV_AUTH_BYPASS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return undefined;
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error: getSessionError }) => {
        if (!mounted) return;
        if (getSessionError) {
          setError(getSessionError.message);
        }
        setSession(data.session);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load session');
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setError(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });
    if (otpError) {
      setError(otpError.message);
      throw otpError;
    }
  }, []);

  const signUpWithPassword = useCallback(
    async ({ email, password, firstName, lastName, companyName }: SignUpInput) => {
      setError(null);
      // Clear any existing session first so a new signup can't silently land
      // the user inside someone else's (e.g. a leftover superuser) account.
      await supabase.auth.signOut().catch(() => undefined);
      const first = firstName.trim();
      const last = lastName.trim();
      const displayName = [first, last].filter(Boolean).join(' ');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: first,
            last_name: last,
            display_name: displayName,
            ...(companyName?.trim() ? { company_name: companyName.trim() } : {}),
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        throw signUpError;
      }
      // If email confirmation is enabled in Supabase, session will be null
      // and the user must click the confirmation link first.
      const needsConfirmation = data.session === null;
      return { needsConfirmation };
    },
    [],
  );

  const signOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      error,
      signInWithPassword,
      signInWithMagicLink,
      signUpWithPassword,
      signOut,
      clearError,
    }),
    [
      session,
      loading,
      error,
      signInWithPassword,
      signInWithMagicLink,
      signUpWithPassword,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
