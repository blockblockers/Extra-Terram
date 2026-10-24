// Extra Terram — src/net/auth.tsx v0.2.0 — email + password accounts (OAuth parked behind VITE_AUTH_PROVIDERS)
// One provider at the root of the app. Everything below it reads `useAuth()`:
//   status 'offline'    no Supabase configured in this build; play locally, no login screen
//   status 'loading'    restoring the session (first paint shows the splash)
//   status 'signed-out' show the login screen
//   status 'guest'      the player chose to skip sign-in; progress stays on this device
//   status 'signed-in'  session + profile loaded; runs post to the server
// `recovery` is true after the player arrives through a password-reset link, until they set a new one.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Provider, Session, User } from '@supabase/supabase-js';
import { authProviders, errorMessage, redirectUrl, supabase } from './supabase';
import { flushQueue } from './progress';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export type AuthStatus = 'loading' | 'offline' | 'signed-out' | 'guest' | 'signed-in';

export interface Auth {
  status: AuthStatus;
  user: User | null;
  profile: Profile | null;
  providers: Provider[];
  /** A message carried back from an auth redirect (expired link, cancelled provider), shown once. */
  notice: string | null;
  /** The player followed a password-reset link and must choose a new password. */
  recovery: boolean;
  signInWithPassword(email: string, password: string): Promise<string | null>;
  /** Resolves with `needsConfirm` when the project requires email confirmation before the first sign-in. */
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }>;
  sendPasswordReset(email: string): Promise<string | null>;
  updatePassword(password: string): Promise<string | null>;
  signInWithProvider(provider: Provider): Promise<string | null>;
  sendMagicLink(email: string): Promise<string | null>;
  verifyEmailCode(email: string, code: string): Promise<string | null>;
  continueAsGuest(): void;
  /** From guest mode back to the login screen. */
  showSignIn(): void;
  signOut(): Promise<void>;
  setUsername(name: string): Promise<string | null>;
}

const GUEST_KEY = 'extra-terram.guest.v1';

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** What to call the player in the HUD and on leaderboards. */
export function playerName(profile: Profile | null, user: User | null): string {
  if (profile?.username) return profile.username;
  if (profile?.display_name) return profile.display_name;
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const metaName = meta?.full_name ?? meta?.name;
  if (typeof metaName === 'string' && metaName.trim()) return metaName.trim();
  if (user?.email) return user.email.split('@')[0];
  return 'Player';
}

function readGuestFlag(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuestFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // storage unavailable: guest mode lasts for this session only
  }
}

/** Pull an auth error out of the URL a provider or magic link redirected back to, and tidy the URL. */
function consumeRedirectNotice(): string | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const search = window.location.search.startsWith('?') ? window.location.search.slice(1) : '';
  const params = new URLSearchParams(hash || search);
  const error = params.get('error_description') ?? params.get('error');
  const touched = params.has('access_token') || params.has('code') || params.has('error') || params.has('error_description');
  if (touched) {
    // supabase-js has read the tokens by now; keep the PWA start URL clean for the next launch.
    window.setTimeout(() => window.history.replaceState(null, '', window.location.pathname), 0);
  }
  if (!error) return null;
  if (/expired|invalid/i.test(error)) return 'That sign-in link has expired. Request a new one.';
  return error.replace(/\+/g, ' ');
}

async function loadProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('ensure_profile');
  if (error) {
    console.warn('ensure_profile failed', error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'offline');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const providers = useMemo(() => authProviders(), []);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!supabase) return;
    const client = supabase;
    setNotice(consumeRedirectNotice());

    const adopt = async (s: Session | null) => {
      if (!alive.current) return;
      setSession(s);
      if (s) {
        setStatus('signed-in');
        const p = await loadProfile();
        if (!alive.current) return;
        setProfile(p);
        // Runs played before signing in (guest, or offline) go up now.
        void flushQueue();
      } else {
        setProfile(null);
        setStatus(readGuestFlag() ? 'guest' : 'signed-out');
      }
    };

    client.auth
      .getSession()
      .then(({ data }) => adopt(data.session))
      .catch(() => adopt(null));

    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') {
        setSession(s);
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        // Arrived through a reset link: there is a session, but the next screen is "new password".
        setRecovery(true);
        if (s) void adopt(s);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        if (s) {
          writeGuestFlag(false);
          void adopt(s);
        }
        return;
      }
      if (event === 'SIGNED_OUT') {
        setRecovery(false);
        void adopt(null);
      }
    });

    return () => {
      alive.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null; // SIGNED_IN fires and the login screen unmounts
    if (/invalid login credentials/i.test(error.message)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(error.message)) return 'Confirm your email first: check your inbox for the link.';
    return errorMessage(error);
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }> => {
    if (!supabase) return { error: 'This build has no server configured.', needsConfirm: false };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) {
      if (/already registered/i.test(error.message)) return { error: 'That email already has an account. Sign in instead.', needsConfirm: false };
      return { error: errorMessage(error), needsConfirm: false };
    }
    // With "Confirm email" on, Supabase returns a user and no session until the link is clicked.
    // (An existing, confirmed address comes back as a user with no identities; treat it the same way.)
    return { error: null, needsConfirm: !data.session };
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
    return error ? errorMessage(error) : null;
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return errorMessage(error);
    setRecovery(false);
    return null;
  }, []);

  // OAuth is parked: no buttons render while VITE_AUTH_PROVIDERS is unset. Kept wired for later.
  const signInWithProvider = useCallback(async (provider: Provider): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } });
    return error ? errorMessage(error) : null; // success navigates away
  }, []);

  const sendMagicLink = useCallback(async (email: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true },
    });
    return error ? errorMessage(error) : null;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s+/g, ''), type: 'email' });
    return error ? errorMessage(error) : null; // success fires SIGNED_IN
  }, []);

  const continueAsGuest = useCallback(() => {
    writeGuestFlag(true);
    setNotice(null);
    setStatus('guest');
  }, []);

  const showSignIn = useCallback(() => {
    writeGuestFlag(false);
    setStatus('signed-out');
  }, []);

  const signOut = useCallback(async () => {
    writeGuestFlag(false);
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn('signOut', error.message);
    }
    setSession(null);
    setProfile(null);
    setRecovery(false);
    setStatus(supabase ? 'signed-out' : 'offline');
  }, []);

  const setUsername = useCallback(async (name: string): Promise<string | null> => {
    if (!supabase) return 'This build has no server configured.';
    const { data, error } = await supabase.rpc('set_username', { new_username: name });
    if (error) return errorMessage(error);
    setProfile((data as Profile | null) ?? null);
    return null;
  }, []);

  const value = useMemo<Auth>(
    () => ({
      status,
      user: session?.user ?? null,
      profile,
      providers,
      notice,
      recovery,
      signInWithPassword,
      signUpWithPassword,
      sendPasswordReset,
      updatePassword,
      signInWithProvider,
      sendMagicLink,
      verifyEmailCode,
      continueAsGuest,
      showSignIn,
      signOut,
      setUsername,
    }),
    [
      status,
      session,
      profile,
      providers,
      notice,
      recovery,
      signInWithPassword,
      signUpWithPassword,
      sendPasswordReset,
      updatePassword,
      signInWithProvider,
      sendMagicLink,
      verifyEmailCode,
      continueAsGuest,
      showSignIn,
      signOut,
      setUsername,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
