// Extra Terram — src/net/supabase.ts v0.1.0 — the one Supabase client, or null when not configured
// The game must run with no backend at all (offline builds, a fresh clone, a blocked network), so
// every caller checks `supabase` for null and falls back to local storage. Only the publishable
// (anon) key ever ships in the client; the service-role key is never used here or on Netlify.
import { createClient, type Provider, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

const url = env.VITE_SUPABASE_URL?.trim();
const key = (env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // OAuth and magic links land back on the app with tokens in the URL; the client picks
          // them up on load. The implicit flow (the default) is kept on purpose: a magic link opened
          // in whichever browser the phone chooses still signs that browser in, where PKCE would
          // demand the browser that requested it.
          detectSessionInUrl: true,
          storageKey: 'extra-terram.auth',
        },
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null;

/** True when the build was given a Supabase URL and key. */
export const online = supabase !== null;

const KNOWN_PROVIDERS: Provider[] = ['google', 'apple', 'github', 'discord', 'facebook', 'twitch', 'azure'];

/**
 * OAuth buttons to show, from VITE_AUTH_PROVIDERS (comma-separated). Parked for now: with the
 * variable unset (or `none`) no provider buttons render and sign-in is email + password only.
 * Re-enable Google by setting VITE_AUTH_PROVIDERS=google once the OAuth client exists
 * (supabase/README.md, section 5); the code path below and in LoginScreen is intact.
 */
export function authProviders(): Provider[] {
  const raw = env.VITE_AUTH_PROVIDERS?.trim();
  if (!raw || raw.toLowerCase() === 'none') return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Provider => (KNOWN_PROVIDERS as string[]).includes(s));
}

/** Where auth redirects come back to: this deployment's origin plus the PWA start path. */
export function redirectUrl(): string {
  return `${window.location.origin}/`;
}

/** A readable message for anything Supabase or the network throws. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const m = (err as { message: string }).message;
    if (/fetch|network|failed to/i.test(m)) return 'No connection to the server. Check your network and try again.';
    return m;
  }
  return 'Something went wrong.';
}
