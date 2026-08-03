import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * NOTE ON IMPORT ORDER: this module imports supabase.ts. It's meant to be
 * imported exactly once, from the root layout, wrapping the whole app —
 * that's the one place it's safe for the Supabase client to enter the
 * module graph despite the SSR constraint described in sessionStorage.ts,
 * because sessionStorage.ts itself no-ops correctly during the web SSR
 * pass. Don't duplicate this provider or import supabase.ts elsewhere at
 * module scope.
 */

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  declared_pb_oz: number | null;
  pb_verified: boolean;
  is_admin: boolean;
  follower_count: number;
  following_count: number;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session + profile fetch resolves. */
  loading: boolean;
  /** True once signed in but before onboarding (declared_pb_oz) is set. */
  needsOnboarding: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_path, declared_pb_oz, pb_verified, is_admin, follower_count, following_count')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[auth] failed to fetch profile', error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    setProfile(await fetchProfile(userId));
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (cancelled) return;
      setSession(initialSession);
      if (initialSession) await loadProfile(initialSession.user.id);
      if (!cancelled) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      needsOnboarding: !!session && profile !== null && profile.declared_pb_oz === null,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
