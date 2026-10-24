// Extra Terram — src/net/supabase.ts v0.2.0 — tolerates a project URL pasted with a path (the "Invalid path" sign-up error)
// The game must run with no backend at all (offline builds, a fresh clone, a blocked network), so
// every caller checks `supabase` for null and falls back to local storage. Only the publishable
// (anon) key ever ships in the client; the service-role key is never used here or on Netlify.
import { createClient, type Provider, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

/**
 * The project URL must be the bare origin (https://<ref>.supabase.co). The dashboard also shows the
 * REST and Auth endpoints (…/rest/v1, …/auth/v1); pasting one of those makes every request hit
 * "<origin>/rest/v1/auth/v1/signup", which the gateway answers with
 * "Invalid path specified in request URL". Keep only the origin and say so once in the console.
 */
function projectOrigin(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const u = new URL(value.includes('://') ? value : `https://${value}`);
    if (u.pathname !== '/' || u.search || u.hash) {
      console.warn(`[extra-terram] VITE_SUPABASE_URL has a path (${u.pathname}); using ${u.origin}. Set it to the bare project URL.`);
    }
    return u.origin;
  } catch {
    console.warn('[extra-terram] VITE_SUPABASE_URL is not a valid URL; running offline.');
    return undefined;
  }
}

const url = projectOrigin(env.VITE_SUPABASE_URL);
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
    if (/invalid path specified/i.test(m)) return 'The server URL in this build is wrong: VITE_SUPABASE_URL must be the bare project URL (https://<ref>.supabase.co), not the REST or Auth endpoint.';
    if (/no route matched/i.test(m)) return 'The server URL in this build points at the wrong host. Check VITE_SUPABASE_URL.';
    return m;
  }
  return 'Something went wrong.';
}
