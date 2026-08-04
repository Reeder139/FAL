-- One result set for a league table plus the caller's own "ghost" row, so
-- the position arithmetic happens once, server-side, rather than being
-- re-derived on the client.
--
-- p_division_id null  -> the national table, positions ranked nationally
-- p_division_id set   -> that division's table, positions ranked in-division
--
-- The ghost row is for free members: anglers with no season_entries row in
-- the running season. scored_catches inner-joins season_entries, so they
-- never appear in league_table at all — their score is reconstructed with
-- hypothetical_season_total(), the same function behind the catch result
-- card, so it uses the season's own scoring settings and bonuses.
--
-- Crucially the ghost's position is computed as "one more than the number
-- of real members ahead of it" rather than by re-ranking the combined set.
-- Real members therefore keep their real positions and the ghost slots in
-- between, which is why a ghost and a real row can legitimately show the
-- same number.
--
-- Anglers who do hold a season_entries row (including `open` tier) already
-- appear in league_table normally and get no ghost row.
create or replace function public.league_table_with_ghost(p_division_id uuid default null)
returns table (
  angler_id     uuid,
  username      citext,
  display_name  text,
  avatar_path   text,
  division_id   uuid,
  division_name text,
  division_rank smallint,
  total_points  numeric,
  counting_fish integer,
  best_fish_oz  integer,
  position_in_table integer,
  is_ghost      boolean,
  is_you        boolean
)
language plpgsql stable as $$
declare
  v_caller        uuid := auth.uid();
  v_season        seasons%rowtype;
  v_profile       profiles%rowtype;
  v_ghost_div     divisions%rowtype;
  v_has_entry     boolean := false;
  v_ghost_points  numeric;
  v_ghost_pos     integer;
  v_ghost_best    integer;
  v_ghost_count   integer;
begin
  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  -- Real rows. Division mode reads league_table (rank partitioned by
  -- division); national mode reads national_league_table (partitioned by
  -- season). Both already cap at the season's counting_fish.
  return query
  select
    lt.angler_id,
    p.username,
    p.display_name,
    p.avatar_path,
    lt.division_id,
    d.name,
    d.rank,
    lt.total_points,
    lt.counting_fish::integer,
    lt.best_fish_oz,
    lt.position::integer,
    false,
    lt.angler_id = v_caller
  from (
    select l.angler_id, l.division_id, l.total_points, l.counting_fish, l.best_fish_oz, l.position
    from league_table l
    where p_division_id is not null
      and l.season_id = v_season.id
      and l.division_id = p_division_id
    union all
    select n.angler_id, n.division_id, n.total_points, n.counting_fish, n.best_fish_oz, n.position
    from national_league_table n
    where p_division_id is null
      and n.season_id = v_season.id
  ) lt
  join profiles p on p.id = lt.angler_id
  join divisions d on d.id = lt.division_id;

  if v_caller is null then
    return;
  end if;

  select * into v_profile from profiles where id = v_caller;
  if v_profile.declared_pb_oz is null then
    return;
  end if;

  select exists (
    select 1 from season_entries se
    where se.season_id = v_season.id
      and se.angler_id = v_caller
      and se.left_at is null
  ) into v_has_entry;
  if v_has_entry then
    return;
  end if;

  v_ghost_div := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  if v_ghost_div.id is null then
    return;
  end if;
  -- On a division page, only surface the ghost on the caller's own
  -- division — they aren't racing the others.
  if p_division_id is not null and p_division_id <> v_ghost_div.id then
    return;
  end if;

  v_ghost_points := public.hypothetical_season_total(v_caller, v_season);

  select max(c.weight_oz), least(count(*), v_season.counting_fish)
  into v_ghost_best, v_ghost_count
  from catches c
  where c.angler_id = v_caller
    and c.status = 'verified'
    and c.caught_at::date between v_season.starts_on and v_season.ends_on;

  if p_division_id is null then
    select 1 + count(*) into v_ghost_pos
    from national_league_table n
    where n.season_id = v_season.id and n.total_points > v_ghost_points;
  else
    select 1 + count(*) into v_ghost_pos
    from league_table l
    where l.season_id = v_season.id
      and l.division_id = v_ghost_div.id
      and l.total_points > v_ghost_points;
  end if;

  return query
  select
    v_caller,
    v_profile.username,
    v_profile.display_name,
    v_profile.avatar_path,
    v_ghost_div.id,
    v_ghost_div.name,
    v_ghost_div.rank,
    v_ghost_points,
    coalesce(v_ghost_count, 0),
    v_ghost_best,
    v_ghost_pos,
    true,
    true;
end;
$$;
