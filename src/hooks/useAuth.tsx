import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { AppRole, Profile } from '@/lib/types';

interface AuthValue {
  user: User | null;
  session: Session | null;
  /** True until it is known whether someone is signed in. */
  loading: boolean;
  profile: Profile | null;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  /** Read the profile again, after a screen has changed it. */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, department: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Who is signed in, once, for the whole app. Every screen and hook reads the
 * same session and the same profile; before this was a provider, each caller
 * kept its own copy and fetched the profile and roles again on every mount.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const loadedFor = useRef<string | null>(null);

  const fetchProfileAndRoles = useCallback(async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('*').eq('user_id', userId),
    ]);
    if (profileRes.data) setProfile(profileRes.data as unknown as Profile);
    if (rolesRes.data) setRoles((rolesRes.data as unknown as { role: AppRole }[]).map((r) => r.role));
  }, []);

  useEffect(() => {
    const apply = (next: Session | null) => {
      setSession(next);
      setUser((current) => (current?.id === next?.user?.id ? current : next?.user ?? null));
      const id = next?.user?.id ?? null;
      if (id !== loadedFor.current) {
        // Only when the person changes: a token refresh is not a reason to read the profile again.
        loadedFor.current = id;
        if (id) setTimeout(() => fetchProfileAndRoles(id), 0); // not inside the auth callback: it holds a lock
        else { setProfile(null); setRoles([]); }
      }
      setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => apply(next));
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    return () => subscription.unsubscribe();
  }, [fetchProfileAndRoles]);

  const value = useMemo<AuthValue>(() => ({
    user, session, loading, profile, roles,
    hasRole: (role) => roles.includes(role),
    refreshProfile: async () => { if (user) await fetchProfileAndRoles(user.id); },
    signIn: async (email, password) => ({ error: (await supabase.auth.signInWithPassword({ email, password })).error }),
    signUp: async (email, password, fullName, department) => ({
      error: (await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, department }, emailRedirectTo: window.location.origin } })).error,
    }),
    signOut: async () => { await supabase.auth.signOut(); },
  }), [user, session, loading, profile, roles, fetchProfileAndRoles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
