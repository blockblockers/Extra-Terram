// Extra Terram — src/ui/AccountBar.tsx v0.1.0 — who is playing, on the menu
// Signed in: avatar, name, sign out, and a one-time prompt to pick a leaderboard name.
// Guest: a nudge to sign in (with the count of runs waiting on the device). Offline build: nothing.
import { useState, type FormEvent } from 'react';
import { playerName, queuedRunCount, useAuth } from '../net';

export function AccountBar() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'offline' || auth.status === 'loading') return null;

  if (auth.status === 'guest' || auth.status === 'signed-out') {
    const queued = queuedRunCount();
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-grove-700/80 bg-grove-900/85 px-3 py-2 text-sm backdrop-blur-sm">
        <span className="min-w-0 truncate text-grove-300/80">{queued > 0 ? `Guest · ${queued} run${queued === 1 ? '' : 's'} waiting to post` : 'Playing as guest'}</span>
        <button onClick={auth.showSignIn} className="shrink-0 rounded-md border border-grove-500 px-3 py-1 font-semibold text-grove-300 hover:bg-grove-700">
          Sign in
        </button>
      </div>
    );
  }

  const display = playerName(auth.profile, auth.user);
  const needsName = !auth.profile?.username;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const err = await auth.setUsername(name);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="mt-3 rounded-xl border border-grove-700/80 bg-grove-900/85 px-3 py-2 text-sm backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Avatar url={auth.profile?.avatar_url ?? null} name={display} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{display}</span>
          {auth.user?.email && <span className="ml-2 truncate text-xs text-grove-300/50">{auth.user.email}</span>}
        </span>
        <button onClick={() => void auth.signOut()} className="shrink-0 rounded-md border border-grove-700 px-3 py-1 text-grove-300 hover:bg-grove-800">
          Sign out
        </button>
      </div>
      {needsName && (
        <form onSubmit={save} className="mt-2 border-t border-grove-700/60 pt-2">
          <label htmlFor="username" className="block text-xs text-grove-300/70">
            Pick a name for the leaderboards (3–20 letters, numbers or _)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. mr_deadblock"
              className="min-w-0 flex-1 rounded-md border border-grove-700 bg-grove-950/80 px-3 py-1.5 font-mono"
            />
            <button type="submit" disabled={busy || name.trim().length < 3} className="rounded-md bg-grove-500 px-3 py-1.5 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-50">
              {busy ? '…' : 'Save'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-1 text-xs text-amber-200">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full border border-grove-700 object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-grove-700 bg-grove-800 text-sm font-bold uppercase text-sap" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
