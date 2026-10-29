-- Extra Terram — supabase/migrations/0003_ultimate_leaderboard.sql — game v0.12.0
-- Run rules beside every run, and an "Ultimate" list per level where any rules count.
--
--   * run_results.rules: the rules a run was played under ({"rounds":30,"bossEvery":5,"difficulty":0});
--     null for rows posted before this migration.
--   * submit_run takes p_rules (optional). The 13-argument version is dropped first so the API
--     keeps exactly one function under the name; clients that do not send p_rules still match.
--   * leaderboard_ultimate / my_best_ultimate: the best single-player score per player on a level
--     over every run, the level as written ('campaign') and custom rules ('endless') alike. The
--     standard `leaderboard` and `my_best` are unchanged: campaign runs only.
--
-- Needs 0001. Re-runnable: every statement is "if not exists", "or replace" or "drop … if exists".

alter table public.run_results add column if not exists rules jsonb;

drop function if exists public.submit_run(text, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb);

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
  p_input_log jsonb default null,
  p_rules jsonb default null
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
  if p_rules is not null then
    if jsonb_typeof(p_rules) <> 'object'
       or jsonb_typeof(p_rules -> 'rounds') <> 'number'
       or jsonb_typeof(p_rules -> 'bossEvery') <> 'number'
       or jsonb_typeof(p_rules -> 'difficulty') <> 'number'
       or (p_rules ->> 'rounds')::numeric not between 1 and 100
       or (p_rules ->> 'bossEvery')::numeric not between 0 and 100
       or (p_rules ->> 'difficulty')::numeric not between 0 and 2 then
      raise exception 'bad run rules';
    end if;
    -- keep only the three known fields
    p_rules := jsonb_build_object('rounds', (p_rules ->> 'rounds')::integer, 'bossEvery', (p_rules ->> 'bossEvery')::integer, 'difficulty', (p_rules ->> 'difficulty')::integer);
  end if;
  if p_mode = 'endless' and p_stars <> 0 then
    raise exception 'a custom run earns no stars';
  end if;
  if p_input_log is not null and pg_column_size(p_input_log) > 262144 then
    p_input_log := null; -- keep the row, drop an oversized log
  end if;

  insert into public.run_results
    (user_id, level_id, race_id, mode, seed, outcome, score, stars, waves_cleared, lives_left, duration_ticks, content_version, engine_version, input_log, rules)
  values
    (auth.uid(), p_level_id, p_race_id, p_mode, p_seed, p_outcome, p_score, p_stars, p_waves_cleared, p_lives_left, p_duration_ticks, p_content_version, p_engine_version, p_input_log, p_rules)
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

-- Ultimate: best single-player score per player on a level, any rules. Always computed from run_results.
create or replace function public.leaderboard_ultimate(p_level_id text, p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  race_id text,
  score integer,
  stars smallint,
  waves_cleared smallint,
  mode text,
  rules jsonb,
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
      r.user_id, p.username, p.display_name, p.avatar_url, r.race_id, r.score, r.stars, r.waves_cleared, r.mode, r.rules, r.created_at
    from public.run_results r
    join public.profiles p on p.id = r.user_id
    where r.level_id = p_level_id and r.mode in ('campaign', 'endless')
    order by r.user_id, r.score desc, r.created_at asc
  ) best
  order by best.score desc, best.created_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- The caller's own best on a level under any rules (null when none).
create or replace function public.my_best_ultimate(p_level_id text)
returns table (score integer, stars smallint, race_id text, waves_cleared smallint, mode text, rules jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.score, r.stars, r.race_id, r.waves_cleared, r.mode, r.rules, r.created_at
  from public.run_results r
  where r.user_id = auth.uid() and r.level_id = p_level_id and r.mode in ('campaign', 'endless')
  order by r.score desc, r.created_at asc
  limit 1
$$;

grant execute on function public.leaderboard_ultimate(text, integer) to anon, authenticated;
-- Signed-in players only (Supabase grants execute on new functions to anon by default).
revoke execute on function
  public.my_best_ultimate(text),
  public.submit_run(text, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function
  public.my_best_ultimate(text),
  public.submit_run(text, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb, jsonb)
  to authenticated;
