-- Extra Terram — supabase/migrations/0002_invites_and_search.sql v0.1.0
-- Player search and lobby invites (the Deadblock pattern: find a friend by name or exact email,
-- invite them to the open lobby; they see the invite in the game and join by its code).
-- Run after 0001. Re-runnable.

-- =============================================================================================
-- Search: by username / display-name prefix, or by exact email. Emails are never returned.
-- =============================================================================================
create or replace function public.search_players(p_query text)
returns table (user_id uuid, username text, display_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := lower(trim(p_query));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if length(q) < 2 then
    return;
  end if;
  if position('@' in q) > 0 then
    -- exact email match only: no enumeration by prefix
    return query
      select p.id, p.username, p.display_name, p.avatar_url
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = q and u.id <> auth.uid()
      limit 1;
    return;
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
    where p.id <> auth.uid()
      and (p.username like q || '%' or lower(coalesce(p.display_name, '')) like q || '%')
    order by (p.username = q) desc, p.username nulls last, p.display_name
    limit 10;
end;
$$;

-- =============================================================================================
-- Invites
-- =============================================================================================
create table if not exists public.match_invites (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references public.matches (id) on delete cascade,
  from_user   uuid not null references auth.users (id) on delete cascade,
  to_user     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  unique (match_id, to_user)
);

create index if not exists match_invites_to_user on public.match_invites (to_user, status, created_at desc);

alter table public.match_invites enable row level security;

drop policy if exists "invite parties read invites" on public.match_invites;
create policy "invite parties read invites" on public.match_invites
  for select using (auth.uid() = to_user or auth.uid() = from_user);
-- No insert/update policies: invites move only through the RPCs below.

-- A participant of an open lobby invites another player. Re-inviting refreshes the invite.
create or replace function public.invite_to_match(p_match_id uuid, p_to_user uuid)
returns public.match_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.match_invites;
  m public.matches;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_to_user = auth.uid() then
    raise exception 'You are already in this lobby.';
  end if;
  select * into m from public.matches where id = p_match_id;
  if not found or m.status <> 'lobby' then
    raise exception 'That lobby is no longer open.';
  end if;
  if not public.is_match_participant(p_match_id) then
    raise exception 'Only players in the lobby can invite.';
  end if;
  if (select count(*) from public.match_players where match_id = p_match_id) >= m.max_players then
    raise exception 'That lobby is full.';
  end if;
  insert into public.match_invites (match_id, from_user, to_user)
  values (p_match_id, auth.uid(), p_to_user)
  on conflict (match_id, to_user) do update set from_user = excluded.from_user, status = 'pending', created_at = now()
  returning * into inv;
  return inv;
end;
$$;

-- Pending invites for the caller: still-open lobbies from the last hour, with what they need to join.
create or replace function public.my_invites()
returns table (
  invite_id bigint,
  match_id uuid,
  code text,
  mode text,
  map_id text,
  max_players smallint,
  seated bigint,
  from_user uuid,
  from_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, m.id, m.code, m.mode, m.map_id, m.max_players,
         (select count(*) from public.match_players mp where mp.match_id = m.id),
         i.from_user, coalesce(p.username, p.display_name, 'A player'), i.created_at
  from public.match_invites i
  join public.matches m on m.id = i.match_id
  left join public.profiles p on p.id = i.from_user
  where i.to_user = auth.uid()
    and i.status = 'pending'
    and m.status = 'lobby'
    and i.created_at > now() - interval '1 hour'
  order by i.created_at desc
$$;

-- Accept (the client then joins by code) or decline.
create or replace function public.respond_invite(p_invite_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_invites
    set status = case when p_accept then 'accepted' else 'declined' end
    where id = p_invite_id and to_user = auth.uid() and status = 'pending';
  if not found then
    raise exception 'That invite is gone.';
  end if;
end;
$$;

grant select on public.match_invites to authenticated;
grant execute on function public.search_players(text), public.invite_to_match(uuid, uuid), public.my_invites(), public.respond_invite(bigint, boolean) to authenticated;
