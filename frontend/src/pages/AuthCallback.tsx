import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const { user, loading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base,#f7f8fa)]">
      <div className="text-center">
        <p className="text-sm text-[var(--text-muted,#6b7280)]">
          {error ? 'Sign-in failed' : 'Completing sign-in...'}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-3 text-xs text-[var(--text-primary,#111827)] underline"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
