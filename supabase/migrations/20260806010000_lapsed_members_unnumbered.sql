-- ===========================================================================
-- A lapsed member stops being numbered in their division.
--
-- league_table_with_ghost decides who gets a position number in a divisional
-- table - which is a claim on prize money - from whether the angler holds a
-- `competitor` entry. That was the whole story when an angler had exactly one
-- season_entries row: tier said whether they were paying.
--
-- Paid membership is now a set of stints (see 20260806000000). Stopping
-- payment closes the stint by setting left_at; the row keeps tier =
-- 'competitor', because it records a period during which they *were* a
-- competitor and their fish from that period still count.
--
-- So this check has been quietly wrong since that shipped: an angler who
-- cancelled kept a numbered, prize-eligible position, and every paying angler
-- below them stayed pushed down a place by someone who had stopped paying.
-- Exactly the fault the original migration was written to fix, reintroduced
-- from the other direction.
--
-- One line: the stint also has to be open.
-- ===========================================================================

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

  -- Division mode. Paid rows are numbered against each other only; unpaid
  -- rows come back with a null position and is_ghost true.
  --
  -- The number is "how many paying anglers are ahead of you, plus one",
  -- counted directly rather than via rank(), because a window function would
  -- have to rank over the unpaid rows too and then have them subtracted back
  -- out. Ties share a number, which is what rank() did before.
  if p_division_id is not null then
    return query
    with member_rows as (
      select
        l.angler_id,
        l.division_id,
        l.total_points,
        l.counting_fish,
        l.best_fish_oz,
        exists (
          select 1
          from season_entries se
          where se.angler_id = l.angler_id
            and se.season_id = l.season_id
            and se.tier = 'competitor'
            and se.left_at is null
        ) as is_paid
      from league_table l
      where l.season_id = v_season.id
        and l.division_id = p_division_id
    )
    select
      m.angler_id,
      p.username,
      p.display_name,
      p.avatar_path,
      m.division_id,
      d.name,
      d.rank,
      m.total_points,
      m.counting_fish::integer,
      m.best_fish_oz,
      case
        when m.is_paid then (
          select count(*)::integer + 1
          from member_rows ahead
          where ahead.is_paid
            and ahead.total_points > m.total_points
        )
        else null
      end,
      not m.is_paid,
      m.angler_id = v_caller
    from member_rows m
    join profiles p on p.id = m.angler_id
    join divisions d on d.id = m.division_id;
  else
    -- National mode, unchanged: everyone is in this standing on equal terms.
    return query
    select
      n.angler_id,
      p.username,
      p.display_name,
      p.avatar_path,
      n.division_id,
      d.name,
      d.rank,
      n.total_points,
      n.counting_fish::integer,
      n.best_fish_oz,
      n.position::integer,
      false,
      n.angler_id = v_caller
    from national_league_table n
    join profiles p on p.id = n.angler_id
    join divisions d on d.id = n.division_id
    where n.season_id = v_season.id;
  end if;

  -- Below here: the ghost for anglers with no season_entries row at all.
  -- They never reach league_table, so their score is reconstructed.
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

  -- In a division the ghost is unnumbered like any other unpaid row. In the
  -- national table it keeps a real position, since that standing includes
  -- everyone.
  if p_division_id is not null then
    v_ghost_pos := null;
  else
    select count(*)::integer + 1
    into v_ghost_pos
    from national_league_table n
    where n.season_id = v_season.id
      and n.total_points > v_ghost_points;
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
