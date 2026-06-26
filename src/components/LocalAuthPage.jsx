import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const setDevSession = (isSigningIn) => {
  if (typeof window === 'undefined') {
    return;
  }

  const tokens = ['access_token', 'base44_access_token', 'token'];

  if (isSigningIn) {
    const devToken = 'dev-token';
    tokens.forEach((key) => window.localStorage.setItem(key, devToken));
    return;
  }

  tokens.forEach((key) => window.localStorage.removeItem(key));
};

const resolveTarget = (returnTo, fallback = '/') => {
  if (!returnTo) {
    return fallback;
  }

  if (/^https?:\/\//i.test(returnTo)) {
    try {
      const url = new URL(returnTo);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  return returnTo;
};

export default function LocalAuthPage({ mode = 'login' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = resolveTarget(searchParams.get('returnTo') || '/');

  useEffect(() => {
    const isSigningIn = mode === 'login';
    setDevSession(isSigningIn);

    const timer = window.setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [mode, navigate, returnTo]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin" />
        <h1 className="text-lg font-semibold text-slate-900">
          {mode === 'login' ? 'Signing you in locally' : 'Signing you out locally'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {mode === 'login'
            ? 'Your local dev session is being created so the app can continue.'
            : 'Your local dev session is being cleared.'}
        </p>
      </div>
    </div>
  );
}
