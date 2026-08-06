-- ===========================================================================
-- Mini leagues: private tables between anglers who know each other.
--
-- The tables existed and nothing used them. What was missing was who may
-- create one, how anyone else gets in, and how a mini league is scored.
--
-- Scoring is the national rule, not the divisional one: every verified fish
-- in the season counts, best 5 in summer and 3 in winter, whether or not the
-- angler pays and whenever they joined. A mini league is a private table
-- between people who know each other, with no prize attached — gating it on
-- membership would make it a worse version of the division, and gating it on
-- join date would mean a league started in August began with everyone on
-- zero.
--
-- That is why it is computed from catches directly rather than from
-- scored_catches: scored_catches inner-joins season_entries, so a free member
-- with no entry does not appear in it at all, and free members are precisely
-- who mini leagues are for.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Creating one is a paid feature; being in one is not.
--
-- The old insert policy was `auth.uid() = owner_id`, which only checked that
-- you were not creating a league in somebody else's name — any signed-in
-- angler could make as many as they liked. Creation now goes through
-- create_mini_league() and the direct insert path is closed.
-- ---------------------------------------------------------------------------
drop policy if exists "users create own mini leagues" on mini_leagues;

-- Membership is added by the owner at creation, so the self-insert policy is
-- no longer the way in. "users leave mini leagues" stays: leaving is still
-- yours to do, and nothing here should be able to trap someone in a league.
drop policy if exists "users join mini leagues as themselves" on mini_league_members;

-- ---------------------------------------------------------------------------
-- Is this angler paying, right now, in the running season?
--
-- The same question three other places ask. An open `competitor` stint —
-- a closed one records a period they *were* paying.
-- ---------------------------------------------------------------------------
create or replace function public.is_paid_member(p_angler_id uuid)
returns boolean
language sql stable as $$
  select exists (
    select 1
    from season_entries se
    join seasons s on s.id = se.season_id
    where se.angler_id = p_angler_id
      and se.tier = 'competitor'
      and se.left_at is null
      and s.status = 'running'
  );
$$;

-- ---------------------------------------------------------------------------
-- Create a mini league and put its members in it.
--
-- SECURITY DEFINER because the owner adds other anglers, which the
-- self-insert policy on mini_league_members deliberately does not allow —
-- the alternative is a policy saying "or you own the league", which would
-- also let an owner add people to a league at any time with no record of it.
-- Here it happens once, at creation, in one transaction.
-- ---------------------------------------------------------------------------
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

  -- Short, unambiguous, and not a sequence: a guessable code is a way into
  -- somebody's private table. Excludes the characters people mistype.
  loop
    v_code := upper(substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=OIl01', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from mini_leagues m where m.join_code = v_code);
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

-- ---------------------------------------------------------------------------
-- The mini leagues this angler is in, with enough to render a list.
-- ---------------------------------------------------------------------------
create or replace function public.my_mini_leagues()
returns table (
  id           uuid,
  name         text,
  join_code    text,
  owner_id     uuid,
  owner_username citext,
  member_count integer,
  season_name  text,
  is_owner     boolean
)
language sql stable as $$
  select
    m.id,
    m.name,
    m.join_code,
    m.owner_id,
    owner.username,
    (select count(*)::integer from mini_league_members mm where mm.mini_league_id = m.id),
    s.name,
    m.owner_id = auth.uid()
  from mini_leagues m
  join mini_league_members me on me.mini_league_id = m.id and me.angler_id = auth.uid()
  join profiles owner on owner.id = m.owner_id
  join seasons s on s.id = m.season_id
  order by m.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- The table itself.
--
-- Computed from catches rather than scored_catches, for the reason in the
-- header: a free member has no season_entries row and so does not exist in
-- scored_catches, and free members are half the point of a mini league.
--
-- Members with nothing verified yet still appear, on zero. Dropping them
-- would make a new league look empty to the people just invited to it.
-- ---------------------------------------------------------------------------
create or replace function public.mini_league_table(p_mini_league_id uuid)
returns table (
  angler_id     uuid,
  username      citext,
  display_name  text,
  avatar_path   text,
  total_points  numeric,
  counting_fish integer,
  best_fish_oz  integer,
  position_in_table integer,
  is_you        boolean
)
language sql stable as $$
  with league as (
    select m.id, m.season_id
    from mini_leagues m
    join mini_league_members mm on mm.mini_league_id = m.id and mm.angler_id = auth.uid()
    where m.id = p_mini_league_id
  ),
  s as (
    select se.* from seasons se join league l on l.season_id = se.id
  ),
  member_catches as (
    select
      mm.angler_id,
      c.weight_oz,
      fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
                 s.scoring_exponent, s.min_qualifying_oz)
        * case when c.is_pb then s.pb_bonus_multiplier else 1 end
        * case when c.fish_name is not null then s.named_fish_multiplier else 1 end as pts
    from mini_league_members mm
    cross join s
    join catches c
      on c.angler_id = mm.angler_id
     and c.status = 'verified'
     and c.caught_at::date between s.starts_on and s.ends_on
    where mm.mini_league_id = (select id from league)
  ),
  ranked as (
    select angler_id, weight_oz, pts,
           row_number() over (partition by angler_id order by pts desc, weight_oz desc) as rn
    from member_catches
  ),
  totals as (
    select r.angler_id,
           sum(r.pts)              as total_points,
           count(*)::integer       as counting_fish,
           max(r.weight_oz)        as best_fish_oz
    from ranked r
    cross join s
    where r.rn <= s.counting_fish
    group by r.angler_id
  )
  select
    mm.angler_id,
    p.username,
    p.display_name,
    p.avatar_path,
    coalesce(t.total_points, 0),
    coalesce(t.counting_fish, 0),
    t.best_fish_oz,
    rank() over (order by coalesce(t.total_points, 0) desc)::integer,
    mm.angler_id = auth.uid()
  from mini_league_members mm
  join profiles p on p.id = mm.angler_id
  left join totals t on t.angler_id = mm.angler_id
  where mm.mini_league_id = (select id from league)
  order by coalesce(t.total_points, 0) desc, p.username;
$$;
