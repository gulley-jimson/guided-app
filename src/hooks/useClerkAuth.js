import { useAuth as clerkUseAuth, useUser as clerkUseUser } from '@clerk/clerk-react';

// Stable across renders — derived from Vite's compile-time injection.
export const CLERK_AVAILABLE = Boolean(import.meta.env.CLERK_PUBLISHABLE_KEY);

const NOOP = {
  available: false,
  isSignedIn: false,
  userId: null,
  email: null,
  getToken: async () => null,
  signOut: async () => {},
};

export function useClerkAuth() {
  if (!CLERK_AVAILABLE) return NOOP;
  return useClerkAuthInner();
}

function useClerkAuthInner() {
  const { isSignedIn, userId, getToken, signOut } = clerkUseAuth();
  const { user } = clerkUseUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  return {
    available: true,
    isSignedIn: Boolean(isSignedIn),
    userId: userId ?? null,
    email,
    getToken: getToken ? () => getToken() : async () => null,
    signOut: signOut ?? (async () => {}),
  };
}
