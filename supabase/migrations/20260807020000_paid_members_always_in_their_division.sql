-- ===========================================================================
-- A paid member appears in their division from the moment they pay.
--
-- The divisional table was built from league_table, which is built from
-- scored_catches — so a member only appeared once they had a qualifying fish
-- inside their paid stint. Pay today, open Divisions, and you are not there.
--
-- Noticed on reeder139: every one of his catches predates the stint his
-- subscription opened, so he had no scored_catches rows, no league_table row,
-- and vanished from Division 3 entirely. He had only been visible because of a
-- hand-made legacy `open` stint that was propping the row up. It is not
-- specific to him — it is what every newly paying member sees until their
-- first qualifying catch.
--
-- So the division table is now built from season_entries: membership is what
-- puts you in a division, and catches are what move you up it. Anyone with an
-- open stint in the division is listed, and league_table / division_league_table
-- are left-joined for whatever they have scored so far, which may be nothing.
--
-- Their row reads 0.0 and carries "Log your first catch to score" instead of a
-- scoring summary — see league-table.tsx, which already had the empty-state
-- line and now picks the wording by whether the row is paid.
--
-- Numbering is unchanged: paid rows are still numbered against each other only,
-- so a place in a cash-prize division still belongs to someone who can win it.
-- A member on zero simply ties with every other member on zero, which is true.
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
  -- out. Ties share a number, which is what rank() did before — and a table
  -- of members who have not scored yet is entirely ties, which is correct.
  if p_division_id is not null then
    return query
    -- Driven by season_entries, not league_table: being in the division is a
    -- fact about membership, not about having caught something yet. left_at is
    -- null keeps it to the stint they are currently in, which is also what
    -- makes this one row per angler — the exclusion constraint allows only one
    -- open stint at a time.
    with base as (
      select
        se.angler_id,
        se.division_id,
        (se.tier = 'competitor')     as is_paid,
        coalesce(l.total_points, 0)  as national_points,
        coalesce(l.counting_fish, 0) as national_fish,
        l.best_fish_oz               as national_best
      from season_entries se
      left join league_table l
        on l.angler_id = se.angler_id
       and l.season_id = se.season_id
       and l.division_id = se.division_id
      where se.season_id = v_season.id
        and se.division_id = p_division_id
        and se.left_at is null
    ),
    -- A paid angler is scored on their paid fish only; an unpaid one is
    -- still shown at their national standing, because that is a real thing
    -- about them and showing 0 would say something false.
    member_rows as (
      select
        b.angler_id,
        b.division_id,
        b.is_paid,
        case when b.is_paid then coalesce(dl.total_points, 0) else b.national_points end
          as total_points,
        case when b.is_paid then coalesce(dl.counting_fish, 0) else b.national_fish end
          as counting_fish,
        case when b.is_paid then dl.best_fish_oz else b.national_best end
          as best_fish_oz
      from base b
      left join division_league_table dl
        on dl.angler_id = b.angler_id
       and dl.season_id = v_season.id
       and dl.division_id = b.division_id
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
    -- National mode. Every angler with a qualifying fish this season is in
    -- here, paid or free, so there is no ghost to append and no row is greyed
    -- out: is_ghost is false for all of them.
    --
    -- Left join, because division_id is null for an angler whose declared PB
    -- matches no division. An inner join dropped exactly the anglers the
    -- national table exists to include.
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
    left join divisions d on d.id = n.division_id
    where n.season_id = v_season.id;

    -- Nothing further to add nationally.
    return;
  end if;

  -- Below here: the divisional ghost, for an angler with no season_entries
  -- row at all. They never reach the base above, so their score is
  -- reconstructed. This is the cash-prize table, so the row is deliberately
  -- unnumbered and carries the Join call to action.
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
  -- Only surface the ghost on the caller's own division — they aren't racing
  -- the others.
  if p_division_id <> v_ghost_div.id then
    return;
  end if;

  v_ghost_points := public.hypothetical_season_total(v_caller, v_season);

  select max(c.weight_oz), least(count(*), v_season.counting_fish)
  into v_ghost_best, v_ghost_count
  from catches c
  where c.angler_id = v_caller
    and c.status = 'verified'
    and c.caught_at::date between v_season.starts_on and v_season.ends_on;

  -- Unnumbered, like any other unpaid row in a division: a place in a
  -- cash-prize table always belongs to someone who can win it.
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
    null::integer,
    true,
    true;
end;
$$;
