-- ===========================================================================
-- Join codes from gen_random_uuid(), not gen_random_bytes().
--
-- pgcrypto is installed in the extensions schema, and create_mini_league()
-- sets search_path = public, so gen_random_bytes() was unresolvable and every
-- creation failed with "function does not exist". gen_random_uuid() is
-- already what this schema uses for defaults and is available unqualified.
-- ===========================================================================

create or replace function public.create_mini_league(
  p_name       text,
  p_member_ids uuid[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner   uuid := auth.uid();
  v_season  uuid;
  v_id      uuid;
  v_code    text;
  v_name    text := nullif(trim(p_name), '');
begin
  if v_owner is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'a mini league needs a name' using errcode = '22023';
  end if;
  if not public.is_paid_member(v_owner) then
    raise exception 'PAID_ONLY: only paid members can create a mini league'
      using errcode = '42501';
  end if;

  select id into v_season from seasons where status = 'running' limit 1;
  if v_season is null then
    raise exception 'no season is running' using errcode = '22023';
  end if;

  -- Short, random, and not a sequence: a guessable code is a way into
  -- somebody's private table.
  --
  -- From gen_random_uuid() rather than gen_random_bytes(): the latter lives
  -- in pgcrypto, which is installed in the extensions schema and so is not on
  -- this function's `search_path = public`. Uppercase hex also happens to
  -- dodge the characters people mistype — there is no O, I or l in it — so
  -- nothing has to be filtered out afterwards.
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from mini_leagues m where m.join_code = v_code);
  end loop;

  insert into mini_leagues (season_id, name, owner_id, join_code)
  values (v_season, v_name, v_owner, v_code)
  returning id into v_id;

  -- The owner is always a member; the invited list is deduped against them
  -- and against itself, and anyone who no longer exists is silently skipped
  -- rather than failing the whole creation.
  insert into mini_league_members (mini_league_id, angler_id)
  select v_id, x.angler_id
  from (
    select v_owner as angler_id
    union
    select unnest(p_member_ids)
  ) x
  join profiles p on p.id = x.angler_id
  on conflict do nothing;

  return v_id;
end; $$;

revoke all on function public.create_mini_league(text, uuid[]) from public, anon;
grant execute on function public.create_mini_league(text, uuid[]) to authenticated, service_role;
