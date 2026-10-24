-- Extra Terram — supabase/migrations/0001_accounts_and_matches.sql v0.1.0
-- Phase 3 (accounts, progress, run results, leaderboards) and the Phase 4 match tables.
-- Paste into the Supabase SQL editor and run once, or apply with the Supabase CLI.
--
-- Rules carried over from Deadblock:
--   * RLS on every user table.
--   * Writes that matter go through SECURITY DEFINER RPCs that validate server-side.
--   * Leaderboards and ratings are computed from result rows, never kept as counters.
--   * Realtime for matches uses Broadcast + Presence (no postgres_changes), so no publication setup.

create extension if not exists pgcrypto;

-- =============================================================================================
-- Profiles
-- =============================================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- A profile row for every new auth user, named from the provider when it offers a name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Belt and braces: the client calls this after sign-in, so a user created before the trigger
-- existed still gets a profile.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  u auth.users;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if found then
    return p;
  end if;
  select * into u from auth.users where id = auth.uid();
  insert into public.profiles (id, display_name, avatar_url)
  values (
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, ''), '@', 1)),
    u.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  select * into p from public.profiles where id = auth.uid();
  return p;
end;
$$;

-- Usernames are unique and lower-case; the check constraint does the format, this does the rest.
create or replace function public.set_username(new_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  candidate text := lower(trim(new_username));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if candidate !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3 to 20 characters: letters, numbers and underscores.';
  end if;
  if exists (select 1 from public.profiles where username = candidate and id <> auth.uid()) then
    raise exception 'That name is taken.';
  end if;
  update public.profiles set username = candidate, updated_at = now() where id = auth.uid() returning * into p;
  return p;
end;
$$;

-- =============================================================================================
-- Progress (one row per user) and run results (the source of truth)
-- =============================================================================================
create table if not exists public.player_progress (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  stars        jsonb not null default '{}'::jsonb,   -- { "<level_id>": { "<race_id>": 0..3 } }
  currency     integer not null default 0,
  unlocked     jsonb not null default '{}'::jsonb,
  settings     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.player_progress enable row level security;

drop policy if exists "users read own progress" on public.player_progress;
create policy "users read own progress" on public.player_progress
  for select using (auth.uid() = user_id);
-- No insert/update policies: progress changes only through submit_run and save_settings below.

create table if not exists public.run_results (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  level_id         text not null,
  race_id          text not null,
  mode             text not null default 'campaign' check (mode in ('campaign', 'endless', 'challenge')),
  seed             text not null,
  outcome          text not null check (outcome in ('won', 'lost')),
  score            integer not null check (score between 0 and 1000000),
  stars            smallint not null check (stars between 0 and 3),
  waves_cleared    smallint not null check (waves_cleared between 0 and 200),
  lives_left       smallint not null check (lives_left between 0 and 200),
  duration_ticks   integer not null check (duration_ticks between 0 and 10000000),
  content_version  text not null,
  engine_version   text not null,
  input_log        jsonb,                              -- the tick-stamped input log: replay + verification
  created_at       timestamptz not null default now()
);

create index if not exists run_results_level_score on public.run_results (level_id, score desc, created_at);
create index if not exists run_results_user_created on public.run_results (user_id, created_at desc);

alter table public.run_results enable row level security;

drop policy if exists "run results are public" on public.run_results;
create policy "run results are public" on public.run_results
  for select using (true);
-- No insert policy: rows arrive only through submit_run.

-- Record a finished run. Validates ranges server-side, stores the row, and raises the player's
-- star record for that level and race. Returns the new row id.
create or replace function public.submit_run(
  p_level_id text,
  p_race_id text,
  p_mode text,
  p_seed text,
  p_outcome text,
  p_score integer,
  p_stars integer,
  p_waves_cleared integer,
  p_lives_left integer,
  p_duration_ticks integer,
  p_content_version text,
  p_engine_version text,
  p_input_log jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  prev integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_level_id !~ '^[a-z0-9-]{3,40}$' or p_race_id !~ '^[a-z]{3,20}$' then
    raise exception 'bad level or race id';
  end if;
  if p_outcome = 'lost' and p_stars <> 0 then
    raise exception 'a lost run has no stars';
  end if;
  -- sanity bound only (20 ticks per second): even back-to-back early calls need a couple of seconds per wave
  if p_duration_ticks < p_waves_cleared * 40 then
    raise exception 'run too short for its waves';
  end if;
  if p_input_log is not null and pg_column_size(p_input_log) > 262144 then
    p_input_log := null; -- keep the row, drop an oversized log
  end if;

  insert into public.run_results
    (user_id, level_id, race_id, mode, seed, outcome, score, stars, waves_cleared, lives_left, duration_ticks, content_version, engine_version, input_log)
  values
    (auth.uid(), p_level_id, p_race_id, p_mode, p_seed, p_outcome, p_score, p_stars, p_waves_cleared, p_lives_left, p_duration_ticks, p_content_version, p_engine_version, p_input_log)
  returning id into new_id;

  insert into public.player_progress (user_id) values (auth.uid()) on conflict (user_id) do nothing;

  select coalesce((stars -> p_level_id ->> p_race_id)::integer, 0) into prev
    from public.player_progress where user_id = auth.uid();
  if p_stars > coalesce(prev, 0) then
    update public.player_progress
      set stars = jsonb_set(
            jsonb_set(stars, array[p_level_id], coalesce(stars -> p_level_id, '{}'::jsonb), true),
            array[p_level_id, p_race_id], to_jsonb(p_stars), true),
          updated_at = now()
      where user_id = auth.uid();
  end if;
  return new_id;
end;
$$;

-- Device settings worth keeping across devices (not the battery saver, which is per device).
create or replace function public.save_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.player_progress (user_id, settings) values (auth.uid(), coalesce(p_settings, '{}'::jsonb))
  on conflict (user_id) do update set settings = excluded.settings, updated_at = now();
end;
$$;

-- Best score per player on a level, with names. Always computed from run_results.
create or replace function public.leaderboard(p_level_id text, p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  race_id text,
  score integer,
  stars smallint,
  waves_cleared smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select best.*
  from (
    select distinct on (r.user_id)
      r.user_id, p.username, p.display_name, p.avatar_url, r.race_id, r.score, r.stars, r.waves_cleared, r.created_at
    from public.run_results r
    join public.profiles p on p.id = r.user_id
    where r.level_id = p_level_id and r.mode = 'campaign'
    order by r.user_id, r.score desc, r.created_at asc
  ) best
  order by best.score desc, best.created_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- The caller's own best on a level (null when none).
create or replace function public.my_best(p_level_id text)
returns table (score integer, stars smallint, race_id text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.score, r.stars, r.race_id, r.created_at
  from public.run_results r
  where r.user_id = auth.uid() and r.level_id = p_level_id and r.mode = 'campaign'
  order by r.score desc, r.created_at asc
  limit 1
$$;

-- =============================================================================================
-- Matches (Phase 4). The tables and RPCs exist now so the client can be built against them;
-- the live traffic goes over Realtime Broadcast on channel `match:<id>`, never through these rows.
-- =============================================================================================
create table if not exists public.matches (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,                 -- 6 letters/digits, typed by friends
  mode             text not null check (mode in ('coop', 'lanes', 'king', 'mirror', 'parallel')),
  max_players      smallint not null check (max_players between 2 and 4),
  team_mode        boolean not null default false,
  host_user_id     uuid not null references auth.users (id) on delete cascade,
  map_id           text not null,
  seed             text not null,
  settings         jsonb not null default '{}'::jsonb,
  status           text not null default 'lobby' check (status in ('lobby', 'running', 'finished', 'abandoned')),
  content_version  text not null,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  ended_at         timestamptz
);

create table if not exists public.match_players (
  match_id       uuid not null references public.matches (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  seat           smallint not null check (seat between 0 and 3),
  team           smallint not null default 0,
  race_id        text not null,
  result         text check (result in ('won', 'lost', 'draw', 'left')),
  placement      smallint,
  score          integer,
  lives_left     smallint,
  rating_before  integer,
  rating_after   integer,
  report         jsonb,
  joined_at      timestamptz not null default now(),
  primary key (match_id, user_id),
  unique (match_id, seat)
);

create table if not exists public.match_logs (
  match_id     uuid primary key references public.matches (id) on delete cascade,
  log          jsonb not null,            -- the host's ordered input stream, for replay and verification
  final_hash   text,
  created_at   timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_logs enable row level security;

-- Policies on match_players cannot query match_players themselves (Postgres reports infinite
-- recursion), so membership is checked through a definer function that bypasses RLS.
create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.match_players mp where mp.match_id = p_match_id and mp.user_id = auth.uid())
$$;

-- Participants can read their matches; everyone else goes through join_match(code).
drop policy if exists "participants read matches" on public.matches;
create policy "participants read matches" on public.matches
  for select using (matches.host_user_id = auth.uid() or public.is_match_participant(matches.id));

drop policy if exists "participants read match players" on public.match_players;
create policy "participants read match players" on public.match_players
  for select using (public.is_match_participant(match_players.match_id));

drop policy if exists "participants read match logs" on public.match_logs;
create policy "participants read match logs" on public.match_logs
  for select using (public.is_match_participant(match_logs.match_id));

create or replace function public.random_match_code()
returns text
language sql
volatile
as $$
  -- no 0/O/1/I, so a code read out loud survives
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;

-- Host opens a lobby. Returns the match row; the host takes seat 0.
create or replace function public.create_match(p_mode text, p_max_players integer, p_team_mode boolean, p_map_id text, p_race_id text, p_content_version text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  c text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  loop
    c := public.random_match_code();
    exit when not exists (select 1 from public.matches where code = c and status in ('lobby', 'running'));
  end loop;
  insert into public.matches (code, mode, max_players, team_mode, host_user_id, map_id, seed, content_version)
  values (c, p_mode, p_max_players, p_team_mode, auth.uid(), p_map_id, lower(c) || '-' || substr(md5(random()::text), 1, 4), p_content_version)
  returning * into m;
  insert into public.match_players (match_id, user_id, seat, team, race_id) values (m.id, auth.uid(), 0, 0, p_race_id);
  return m;
end;
$$;

-- Join a lobby by its code. Returns the match row; the caller gets the lowest free seat.
create or replace function public.join_match(p_code text, p_race_id text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  taken integer;
  s integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into m from public.matches where code = upper(trim(p_code)) and status = 'lobby' for update;
  if not found then
    raise exception 'No open lobby with that code.';
  end if;
  if exists (select 1 from public.match_players where match_id = m.id and user_id = auth.uid()) then
    return m;
  end if;
  select count(*) into taken from public.match_players where match_id = m.id;
  if taken >= m.max_players then
    raise exception 'That lobby is full.';
  end if;
  select min(x) into s from generate_series(0, m.max_players - 1) x
    where x not in (select seat from public.match_players where match_id = m.id);
  insert into public.match_players (match_id, user_id, seat, team, race_id)
  values (m.id, auth.uid(), s, case when m.team_mode then s % 2 else 0 end, p_race_id);
  return m;
end;
$$;

-- Host starts the match once the lobby is ready.
create or replace function public.start_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
begin
  update public.matches set status = 'running', started_at = now()
    where id = p_match_id and host_user_id = auth.uid() and status = 'lobby'
    returning * into m;
  if not found then
    raise exception 'Only the host can start an open lobby.';
  end if;
  return m;
end;
$$;

-- Each client reports its own result; the match is finished when every seat has reported.
create or replace function public.submit_match_result(p_match_id uuid, p_result text, p_placement integer, p_score integer, p_lives_left integer, p_report jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.match_players
    set result = p_result, placement = p_placement, score = p_score, lives_left = p_lives_left, report = p_report
    where match_id = p_match_id and user_id = auth.uid();
  if not found then
    raise exception 'not a participant';
  end if;
  select count(*) into remaining from public.match_players where match_id = p_match_id and result is null;
  if remaining = 0 then
    update public.matches set status = 'finished', ended_at = now() where id = p_match_id and status = 'running';
  end if;
end;
$$;

-- The host stores the ordered input log at the end (replays, later verification).
create or replace function public.save_match_log(p_match_id uuid, p_log jsonb, p_final_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.matches where id = p_match_id and host_user_id = auth.uid()) then
    raise exception 'only the host saves the log';
  end if;
  insert into public.match_logs (match_id, log, final_hash) values (p_match_id, p_log, p_final_hash)
  on conflict (match_id) do update set log = excluded.log, final_hash = excluded.final_hash;
end;
$$;

-- Rating: computed from match history when needed, never stored as a counter on profiles.
create or replace function public.rating_current(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rating_after from public.match_players mp
       join public.matches m on m.id = mp.match_id
      where mp.user_id = p_user_id and mp.rating_after is not null and m.status = 'finished'
      order by m.ended_at desc limit 1),
    1000)
$$;

-- =============================================================================================
-- Grants: the anon and authenticated roles may call the RPCs; row access stays with RLS.
-- =============================================================================================
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.run_results to anon, authenticated;
grant select on public.player_progress, public.matches, public.match_players, public.match_logs to authenticated;
grant execute on function public.leaderboard(text, integer), public.is_match_participant(uuid) to anon, authenticated;
grant execute on function
  public.ensure_profile(), public.set_username(text), public.save_settings(jsonb), public.my_best(text),
  public.submit_run(text, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb),
  public.create_match(text, integer, boolean, text, text, text), public.join_match(text, text), public.start_match(uuid),
  public.submit_match_result(uuid, text, integer, integer, integer, jsonb), public.save_match_log(uuid, jsonb, text),
  public.rating_current(uuid)
  to authenticated;
-- Internal helpers: not callable from the API (Supabase grants execute on new functions by default).
revoke execute on function public.random_match_code(), public.handle_new_user() from public, anon, authenticated;
