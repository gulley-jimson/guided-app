import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'guided.deepLinkAuth';

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function useDeepLinkAuth({ backendUrl }) {
  const [auth, setAuth] = useState(readStored);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  useEffect(() => {
    if (!window.guided?.onAuthDeepLink) return undefined;
    const off = window.guided.onAuthDeepLink(async (payload) => {
      if (!payload?.token) return;
      setVerifyError(null);
      setVerifying(true);
      try {
        const res = await fetch(`${backendUrl}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: payload.token }),
        });
        const data = await res.json();
        if (!res.ok || !data?.valid) {
          throw new Error(data?.error || 'Could not verify sign-in.');
        }
        const next = {
          token: payload.token,
          userId: payload.userId ?? null,
          email: payload.email ?? null,
          plan: data?.plan ?? payload.plan ?? null,
          receivedAt: Date.now(),
        };
        writeStored(next);
        setAuth(next);
      } catch (err) {
        setVerifyError(err?.message ?? 'Could not verify sign-in.');
      } finally {
        setVerifying(false);
      }
    });
    return off;
  }, [backendUrl]);

  const signOut = useCallback(() => {
    writeStored(null);
    setAuth(null);
    setVerifyError(null);
  }, []);

  const getToken = useCallback(async () => auth?.token ?? null, [auth?.token]);

  return {
    available: true,
    isSignedIn: Boolean(auth?.token && auth?.userId),
    userId: auth?.userId ?? null,
    email: auth?.email ?? null,
    token: auth?.token ?? null,
    plan: auth?.plan ?? null,
    verifying,
    verifyError,
    signOut,
    getToken,
  };
}
