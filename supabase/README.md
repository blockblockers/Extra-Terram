# Extra Terram — Supabase setup (accounts, progress, leaderboards, matches)

Everything the game needs from Supabase lives in this folder plus three environment variables.
The game also runs with **no** Supabase at all (no login screen, scores stay on the device), so
nothing here blocks local play or a fresh clone.

## 1. Run the migrations

Dashboard → **SQL Editor** → New query → paste the whole of
[`migrations/0001_accounts_and_matches.sql`](migrations/0001_accounts_and_matches.sql) → **Run**.
Expected result: "Success. No rows returned" (plus a few NOTICEs about policies not existing yet).
Then do the same with [`migrations/0002_invites_and_search.sql`](migrations/0002_invites_and_search.sql)
(player search + lobby invites; it needs 0001 first). Both files are re-runnable: every statement
is `if not exists` / `or replace` / `drop … if exists`, so running one twice is harmless.

Already ran 0001 before 0002 existed? Just run 0002 now — nothing in 0001 changes.

What it creates:

| Object | Purpose |
| --- | --- |
| `profiles` | One row per auth user (`username`, `display_name`, `avatar_url`). Created by a trigger on `auth.users`; `ensure_profile()` backfills on first sign-in. Public read; owners update. No counters or rating columns — ever. |
| `player_progress` | One row per user: `stars` (per level, per race), `currency`, `unlocked`, `settings`. Readable by its owner only; written only by RPCs. |
| `run_results` | Every finished single-player run (level, race, mode, seed, outcome, score, stars, waves, lives, duration, versions, optional input log). Public read, insert only through `submit_run`. **The source of truth for leaderboards.** |
| `matches`, `match_players`, `match_logs` | Phase 4 lobbies and results. Visible to participants only. |
| RPCs | `ensure_profile`, `set_username`, `submit_run`, `save_settings`, `leaderboard`, `my_best`, `create_match`, `join_match`, `start_match`, `submit_match_result`, `save_match_log`, `rating_current`. All `SECURITY DEFINER`, all validate `auth.uid()` and their inputs. |
| `match_invites` (0002) | One row per invite to a lobby (`from_user`, `to_user`, `status`). Readable by the two parties only; written only through RPCs. |
| RPCs (0002) | `search_players(query)` — username / display-name **prefix**, or an **exact** email; never returns emails, never lists everyone, skips the caller. `invite_to_match`, `my_invites` (pending, lobby still open, last hour), `respond_invite`. |

Rules carried over from Deadblock, baked into the SQL:

- RLS is enabled on every table; the client never inserts or updates a table directly.
- Writes go through RPCs that re-check everything server-side (a lost run cannot carry stars, a
  run cannot be shorter than its waves, a lobby cannot overfill, only the host can start).
- Standings and ratings are **computed** from `run_results` / `match_players` rows, never stored
  as counters that drift.
- Live multiplayer uses Realtime **Broadcast + Presence**, never `postgres_changes`, so there is no
  publication / replica-identity setup to get wrong.

Check it worked: **Table Editor** lists the seven tables, each with the shield icon (RLS on);
**Database → Functions** lists the RPCs.

How invites reach the other player: the row in `match_invites` is the record (`my_invites` lists
it after a reload); a Realtime **Broadcast** on the invitee's personal channel `user:<id>` is the
nudge that pops the toast while their game is open. Nothing to configure for either.

## 2. Keys and environment variables

Dashboard → **Project Settings → API Keys** → "Publishable and secret API keys" tab.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The bare project URL only: `https://<ref>.supabase.co` — nothing after `.co`. The Data API page also lists the REST endpoint (`…/rest/v1`) and the Auth endpoint (`…/auth/v1`); pasting either one breaks every call with "Invalid path specified in request URL". The client now strips a path and warns in the console, but set it right. |
| `VITE_SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_…`). The legacy `anon` JWT also works; Supabase is retiring it by the end of 2026, so start with the publishable one. |
| `VITE_AUTH_PROVIDERS` | **Leave unset for now.** OAuth is parked; sign-in is email + password. Setting it (e.g. `google`) brings the provider buttons back once section 5 is done. |

Never put the **secret** / `service_role` key anywhere in this repo or in Netlify: it bypasses RLS.

- **Local:** copy `.env.example` to `.env` (git-ignored) and fill it in; `npm run dev` picks it up.
- **Netlify:** Site configuration → Environment variables → add `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` → then **Deploys → Trigger deploy → Clear cache and deploy site** (Vite
  inlines them at build time, so a plain redeploy of the old build does nothing).

## 3. Auth URLs

Dashboard → **Authentication → URL Configuration**.

- **Site URL:** the Netlify site, e.g. `https://extra-terram.netlify.app` (later: the real domain —
  set the domain here *before* configuring providers, so the OAuth config is only done once).
- **Redirect URLs** (allow list — the app sends `window.location.origin + '/'` as `redirectTo`, and it
  must match an entry here or Supabase falls back to the Site URL):
  - `http://localhost:5173/**` (local dev)
  - `https://extra-terram.netlify.app/**` (your site name)
  - `https://**--extra-terram.netlify.app/**` (Netlify deploy previews and branch deploys)

## 4. Email sign-in (password, plus link + code)

Dashboard → **Authentication → Sign In / Providers → Email**:

- **Enable email provider**: on (default). This is the whole sign-in for now: *Sign in* /
  *Create account* with email + password, *Forgot password?*, and *Email me a sign-in link instead*.
- **Confirm email**: it is **on** by default, which means a new account cannot sign in until the
  player clicks the confirmation email — and the built-in mailer only sends a few emails per hour.
  For now, turn it **off** so "Create account" signs the player straight in; turn it back on once
  custom SMTP (below) is configured. The game handles both: with confirmation on it shows
  "Confirm *you@example.com* with the link we just sent, then sign in".
- **Minimum password length**: the game asks for 8 characters; keep the dashboard value at or below
  that (default 6) or players will see the server's message instead.
- **Secure email change / password reset**: defaults are fine. The reset link returns the player to
  the game, which shows a "Choose a new password" screen before the menu.

Dashboard → **Authentication → Email Templates → Magic Link**: add the 6-digit code to the body so a
player who opened the email in a different browser than the installed app can still sign in by
typing it. Suggested body:

```html
<h2>Sign in to Extra Terram</h2>
<p><a href="{{ .ConfirmationURL }}">Tap here to sign in</a> on the device you started from.</p>
<p>Or enter this code in the game: <strong style="font-size:1.4em;letter-spacing:.2em">{{ .Token }}</strong></p>
<p>The link and code expire in one hour. If you did not request this, ignore this email.</p>
```

The login screen's "Email link" option calls `signInWithOtp` (link **and** code in one email); the
code box calls `verifyOtp({ type: 'email' })`. Supabase's built-in mailer is rate-limited to a
handful of emails per hour and meant for development: before inviting players, set **Project
Settings → Authentication → SMTP Settings** to a real provider (Resend, Postmark, SES…), and
raise the limits under **Authentication → Rate Limits** if needed. Password sign-in itself sends no
email, so it keeps working whatever the mailer is doing.

## 5. Google sign-in (and any other provider) — parked

Not needed now. The provider buttons render only when `VITE_AUTH_PROVIDERS` is set, and it is left
unset. When you want Google back:

1. Google Cloud Console → APIs & Services → **Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
   - Authorized JavaScript origins: `https://extra-terram.netlify.app`, `http://localhost:5173`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     (shown verbatim on the Supabase Google provider page as "Callback URL (for OAuth)").
   - Configure the OAuth consent screen (app name "Extra Terram", support email). While it is in
     "Testing" only listed test users can sign in; publish it before launch.
2. Supabase → **Authentication → Sign In / Providers → Google**: enable, paste Client ID and Client
   Secret, save.
3. Set `VITE_AUTH_PROVIDERS=google` (Netlify env + `.env`) and redeploy with a cleared cache; the
   "Continue with Google" button appears above the email form.
4. Other providers (Apple, GitHub, Discord…) follow the same shape: create the app on the provider,
   give it the Supabase callback URL, enable it in Supabase, then add its name to
   `VITE_AUTH_PROVIDERS`. Apple additionally needs a Services ID and key and is required by Apple's
   rules if you ship on iOS with any other social login.

Until there is a custom auth domain, the Google consent screen shows the `…supabase.co` address.

## 6. Realtime (multiplayer, Phase 4)

Nothing to configure for Broadcast and Presence: the client opens `match:<id>` channels directly.
Later, if lobbies should be unlistenable to outsiders, flip to private channels: set
`private: true` in `MatchChannel` and add `realtime.messages` RLS policies (Realtime → Policies)
that allow participants only — the `is_match_participant()` function in the migration is written
to be reusable there.

## 7. What the client does with all this

- `src/net/supabase.ts` — the client (null when the env is missing), provider list, redirect URL.
- `src/net/auth.tsx` — `AuthProvider` / `useAuth()`: session restore, email + password (sign in,
  create account, reset, new-password screen), magic link + code, guest mode (local flag),
  sign-out, `set_username`; OAuth kept wired but dormant.
- `src/net/progress.ts` — `recordRun()` → `submit_run`, or a local queue that is flushed on the
  next sign-in; local personal bests for offline display.
- `src/net/leaderboard.ts` — `leaderboard` and `my_best` with a 30 s cache.
- `src/net/match.ts` — match RPC wrappers and `MatchChannel` (Broadcast + Presence).
- `src/ui/LoginScreen.tsx`, `AccountBar.tsx`, `Leaderboard.tsx` — the screens.

Guest play is deliberate: a guest gets the whole single-player game, their runs wait on the device
("Saved on this device · sign in to post it"), and they upload automatically the first time that
device signs in.

## 8. Checking it end to end

1. `npm run dev` with a filled `.env` → the login screen appears over the key art.
2. **Play as guest** → menu shows "Playing as guest · Sign in"; finish a run → the result screen
   says "Saved on this device · sign in to post it".
3. **Sign in** → *Create account* with an email and password (instant with "Confirm email" off) →
   back on the menu with your name; pick a username when prompted → "Top scores" under the level
   list shows the queued run, now posted.
4. Dashboard → Table Editor → `run_results` shows the row; `profiles` has your username.
