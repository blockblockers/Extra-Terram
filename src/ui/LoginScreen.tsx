// Extra Terram — src/ui/LoginScreen.tsx v0.3.0 — panels reveal after the title intro
// Same shape as Deadblock's door, minus the provider buttons for now: they render only when
// VITE_AUTH_PROVIDERS names a provider (see supabase/README.md, section 5). Sign-in is Supabase's own
// email + password, with "email me a link" and "forgot password" as the two side doors.
// Nothing here blocks play: a guest gets the whole single-player game and their runs wait on the
// device until they sign in. No window.alert/confirm anywhere (iOS standalone PWAs swallow them).
import { useState, type FormEvent } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { CONTENT_VERSION } from '../content';
import { ENGINE_VERSION } from '../engine';
import { queuedRunCount, useAuth } from '../net';
import { LogoLockup, Reveal, TitleColumn } from './Title';

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  discord: 'Discord',
  facebook: 'Facebook',
  twitch: 'Twitch',
  azure: 'Microsoft',
};

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode =
  | { kind: 'password' } // sign in / create account
  | { kind: 'link' } // ask for a magic link instead
  | { kind: 'sent-link'; email: string } // link + code sent
  | { kind: 'sent-confirm'; email: string } // account created, confirmation email sent
  | { kind: 'reset' } // forgot password
  | { kind: 'sent-reset'; email: string };

export function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(auth.notice);
  const queued = queuedRunCount();

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setBusy(null);
  };

  const validEmail = (): string | null => {
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      setError('Enter a full email address.');
      return null;
    }
    return addr;
  };

  const validPassword = (): boolean => {
    if (password.length < MIN_PASSWORD) {
      setError(`Passwords are at least ${MIN_PASSWORD} characters.`);
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------- email + password
  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    const addr = validEmail();
    if (!addr || !password) {
      if (addr && !password) setError('Enter your password.');
      return;
    }
    setError(null);
    setBusy('signin');
    const err = await auth.signInWithPassword(addr, password);
    if (err) {
      setError(err);
      setBusy(null);
    }
    // success: the auth state flips to signed-in and this screen unmounts
  };

  const createAccount = async () => {
    const addr = validEmail();
    if (!addr || !validPassword()) return;
    setError(null);
    setBusy('signup');
    const res = await auth.signUpWithPassword(addr, password);
    setBusy(null);
    if (res.error) setError(res.error);
    else if (res.needsConfirm) go({ kind: 'sent-confirm', email: addr });
    // otherwise SIGNED_IN already fired
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    const addr = validEmail();
    if (!addr) return;
    setError(null);
    setBusy('reset');
    const err = await auth.sendPasswordReset(addr);
    setBusy(null);
    if (err) setError(err);
    else go({ kind: 'sent-reset', email: addr });
  };

  // ---------------------------------------------------------------- magic link + code
  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const addr = validEmail();
    if (!addr) return;
    setError(null);
    setBusy('link');
    const err = await auth.sendMagicLink(addr);
    setBusy(null);
    if (err) setError(err);
    else go({ kind: 'sent-link', email: addr });
  };

  const useCode = async (e: FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'sent-link') return;
    const token = code.replace(/\s+/g, '');
    if (!/^\d{6,8}$/.test(token)) {
      setError('The code is the 6 digits from the email.');
      return;
    }
    setError(null);
    setBusy('code');
    const err = await auth.verifyEmailCode(mode.email, token);
    setBusy(null);
    if (err) setError(err);
  };

  // ---------------------------------------------------------------- OAuth (parked; renders only with VITE_AUTH_PROVIDERS)
  const provider = async (p: Provider) => {
    setError(null);
    setBusy(p);
    const err = await auth.signInWithProvider(p);
    if (err) {
      setError(err);
      setBusy(null);
    }
  };

  const field = 'w-full rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 text-base';
  const primary = 'rounded-lg bg-grove-500 px-4 py-3 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-60';
  const secondary = 'rounded-lg border border-grove-500 px-4 py-3 font-semibold text-grove-300 hover:bg-grove-700 disabled:opacity-60';
  const link = 'text-xs text-grove-300/80 underline-offset-2 hover:underline';

  return (
    <TitleColumn>
      <LogoLockup />
      <div className="flex-1" />

      <Reveal>
      <section className="rounded-xl border border-grove-700/80 bg-grove-900/85 p-4 backdrop-blur-sm" aria-labelledby="login-title">
        <h2 id="login-title" className="text-xs uppercase tracking-wide text-grove-300/60">
          Sign in
        </h2>
        <p className="mt-1 text-sm text-grove-300/80">Keep your stars and scores across devices and play online. Guests play the full campaign on this device.</p>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-rust/50 bg-rust/15 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}

        {auth.providers.length > 0 && (
          <>
            <div className="mt-3 flex flex-col gap-2">
              {auth.providers.map((p) => (
                <button key={p} onClick={() => provider(p)} disabled={busy !== null} className="flex w-full items-center justify-center gap-2 rounded-lg bg-grove-300 px-4 py-3 font-semibold text-grove-950 hover:bg-sap disabled:opacity-60">
                  <ProviderGlyph />
                  {busy === p ? 'Opening…' : `Continue with ${PROVIDER_LABEL[p] ?? p}`}
                </button>
              ))}
            </div>
            <Divider />
          </>
        )}

        {mode.kind === 'password' && (
          <form onSubmit={signIn} noValidate className="mt-3 flex flex-col gap-2">
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="you@example.com" className={field} />
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Password"
                className={`${field} pr-16`}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 px-3 text-xs text-grove-300/70 hover:text-grove-300" aria-pressed={showPassword}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="submit" disabled={busy !== null} className={primary}>
                {busy === 'signin' ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={createAccount} disabled={busy !== null} className={secondary}>
                {busy === 'signup' ? 'Creating…' : 'Create account'}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <button type="button" onClick={() => go({ kind: 'reset' })} className={link}>
                Forgot password?
              </button>
              <button type="button" onClick={() => go({ kind: 'link' })} className={link}>
                Email me a sign-in link instead
              </button>
            </div>
          </form>
        )}

        {mode.kind === 'reset' && (
          <form onSubmit={sendReset} noValidate className="mt-3 flex flex-col gap-2">
            <p className="text-sm">Enter your email and we'll send a link to choose a new password.</p>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="you@example.com" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" disabled={busy !== null} className={primary}>
                {busy === 'reset' ? 'Sending…' : 'Send reset link'}
              </button>
              <button type="button" onClick={() => go({ kind: 'password' })} className={secondary}>
                Back
              </button>
            </div>
          </form>
        )}

        {mode.kind === 'link' && (
          <form onSubmit={sendLink} noValidate className="mt-3 flex flex-col gap-2">
            <p className="text-sm">No password needed: the email carries a sign-in link and a 6-digit code.</p>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="you@example.com" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" disabled={busy !== null} className={primary}>
                {busy === 'link' ? 'Sending…' : 'Email link'}
              </button>
              <button type="button" onClick={() => go({ kind: 'password' })} className={secondary}>
                Back
              </button>
            </div>
          </form>
        )}

        {mode.kind === 'sent-link' && (
          <form onSubmit={useCode} noValidate className="mt-3 rounded-lg border border-grove-700 bg-grove-950/60 p-3">
            <p className="text-sm">
              Check <span className="font-semibold text-grove-300">{mode.email}</span>. Tap the link in the email on this device, or type the code it shows:
            </p>
            <div className="mt-2 flex gap-2">
              <input id="email-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="min-w-0 flex-1 rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 font-mono text-base tracking-widest" />
              <button type="submit" disabled={busy !== null} className="rounded-md bg-grove-500 px-3 py-2 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-60">
                {busy === 'code' ? '…' : 'Sign in'}
              </button>
            </div>
            <button type="button" onClick={() => go({ kind: 'password' })} className={`mt-2 ${link}`}>
              Back to sign in
            </button>
          </form>
        )}

        {mode.kind === 'sent-confirm' && (
          <div className="mt-3 rounded-lg border border-grove-700 bg-grove-950/60 p-3 text-sm">
            <p>
              Account created. Confirm <span className="font-semibold text-grove-300">{mode.email}</span> with the link we just sent, then sign in.
            </p>
            <button type="button" onClick={() => go({ kind: 'password' })} className={`mt-2 ${link}`}>
              Back to sign in
            </button>
          </div>
        )}

        {mode.kind === 'sent-reset' && (
          <div className="mt-3 rounded-lg border border-grove-700 bg-grove-950/60 p-3 text-sm">
            <p>
              If <span className="font-semibold text-grove-300">{mode.email}</span> has an account, a reset link is on its way. Open it on this device to choose a new password.
            </p>
            <button type="button" onClick={() => go({ kind: 'password' })} className={`mt-2 ${link}`}>
              Back to sign in
            </button>
          </div>
        )}

        <Divider />
        <button onClick={auth.continueAsGuest} className="w-full rounded-lg border border-grove-700 px-4 py-3 text-grove-300 hover:bg-grove-800">
          Play as guest
        </button>
        <p className="mt-2 text-center text-xs text-grove-300/50">
          {queued > 0 ? `${queued} run${queued === 1 ? '' : 's'} on this device will post to the leaderboard once you sign in.` : 'Guest runs stay on this device until you sign in.'}
        </p>
      </section>

      <p className="mt-3 text-center text-[11px] text-grove-300/40">
        engine {ENGINE_VERSION} · content {CONTENT_VERSION}
      </p>
      </Reveal>
    </TitleColumn>
  );
}

/** After a password-reset link: the session exists, but the player must choose a new password first. */
export function NewPasswordScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Passwords are at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== again) {
      setError('The two passwords differ.');
      return;
    }
    setError(null);
    setBusy(true);
    const err = await auth.updatePassword(password);
    setBusy(false);
    if (err) setError(err);
    // success clears auth.recovery and the app moves on to the menu
  };

  return (
    <TitleColumn>
      <LogoLockup />
      <div className="flex-1" />
      <Reveal>
      <section className="rounded-xl border border-grove-700/80 bg-grove-900/85 p-4 backdrop-blur-sm" aria-labelledby="newpw-title">
        <h2 id="newpw-title" className="text-xs uppercase tracking-wide text-grove-300/60">
          Choose a new password
        </h2>
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-rust/50 bg-rust/15 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}
        <form onSubmit={save} noValidate className="mt-3 flex flex-col gap-2">
          <input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="New password" className="w-full rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 text-base" />
          <input id="new-password-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" placeholder="Repeat it" className="w-full rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 text-base" />
          <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-grove-500 px-4 py-3 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-60">
            {busy ? 'Saving…' : 'Save password'}
          </button>
          <button type="button" onClick={() => void auth.signOut()} className="text-xs text-grove-300/80 underline-offset-2 hover:underline">
            Cancel and sign out
          </button>
        </form>
      </section>
      </Reveal>
    </TitleColumn>
  );
}

function Divider() {
  return (
    <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-widest text-grove-300/40">
      <span className="h-px flex-1 bg-grove-700" />
      or
      <span className="h-px flex-1 bg-grove-700" />
    </div>
  );
}

/** A neutral sign-in glyph (no provider logos are drawn in-app). */
function ProviderGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
