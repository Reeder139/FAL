-- ===========================================================================
-- The National League actually contains everyone.
--
-- The page says "All players' best fish count in this league" and the product
-- rule is that it counts every angler's best 5 (summer) / 3 (winter),
-- paid or free. It did not. national_league_table is built on scored_catches,
-- which inner-joins season_entries — and a free member has no season_entries
-- row at all, because nothing creates one until they pay (apply_membership is
-- the only inserter). So free members were absent from the standing entirely.
--
-- Found via a real signup: an angler with eight verified catches and 112.4
-- points — more than anyone else in the season — did not appear in the
-- national table, and no other member could see him. He saw himself only
-- through league_table_with_ghost's reconstructed "ghost" row, which is
-- rendered greyed out and dashed, with a Join pill in place of his name line
-- and no counting-fish photos. So the highest scorer in the league was shown,
-- to himself, as a prompt to join in order to play.
--
-- The ghost was only ever meant for the divisional tables, where an unpaid
-- angler genuinely is outside the competition. league-table.tsx says as much
-- in a comment: "The same angler keeps their strip in the national table,
-- where they take an ordinary numbered row with no pill." The SQL just never
-- agreed — is_ghost was hardcoded true in both modes.
--
-- Fixed at the source rather than by restyling the ghost. A ghost only the
-- angler themselves can see is not a standing; the other members still would
-- not have seen him. The national table has to contain the row.
--
-- The divisional tables are deliberately untouched. They are the cash-prize
-- competition, they count paid fish inside paid stints only, and
-- division_scored_catches / division_league_table keep doing exactly that.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Every verified catch, scored against whichever season its date falls in.
--
-- No season_entries join — that is the entire point of this view existing
-- alongside scored_catches. Membership decides prize eligibility; it does not
-- decide whether a fish was caught.
--
-- The ranking orders by the *final* points, including the PB and named-fish
-- multipliers, where scored_catches orders by the bare fal_points() and
-- applies the multipliers afterwards. This matches hypothetical_season_total,
-- which is what the league-position strip and the catch result card already
-- show a free member — so their strip and their table row now agree, which
-- they would not if this picked a different top five.
-- ---------------------------------------------------------------------------
create or replace view national_scored_catches
with (security_invoker = on) as
with scored as (
  select
    c.id        as catch_id,
    c.angler_id,
    s.id        as season_id,
    c.weight_oz,
    c.caught_at,
    fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
               s.scoring_exponent, s.min_qualifying_oz)
      * case when c.is_pb then s.pb_bonus_multiplier else 1 end
      * case when c.fish_name is not null then s.named_fish_multiplier else 1 end
                as points
  from catches c
  join seasons s on c.caught_at::date between s.starts_on and s.ends_on
  where c.status = 'verified'
)
select
  catch_id,
  angler_id,
  season_id,
  weight_oz,
  caught_at,
  points,
  row_number() over (
    partition by angler_id, season_id
    order by points desc, caught_at asc
  ) as rank_in_season
from scored;

-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: `create or replace view` cannot change a
-- view's column types, and division_id goes from a plain column to a resolved
-- one. Nothing depends on it as a database object — league_table_with_ghost is
-- a function, and functions are not tracked dependencies — so this does not
-- cascade.
-- ---------------------------------------------------------------------------
drop view if exists national_league_table;

create view national_league_table
with (security_invoker = on) as
with counting as (
  select sc.season_id, sc.angler_id, sc.points, sc.weight_oz
  from national_scored_catches sc
  join seasons s on s.id = sc.season_id
  where sc.rank_in_season <= s.counting_fish
),
totals as (
  select
    c.season_id,
    c.angler_id,
    sum(c.points)    as total_points,
    count(*)         as counting_fish,
    max(c.weight_oz) as best_fish_oz
  from counting c
  group by c.season_id, c.angler_id
)
select
  t.season_id,
  t.angler_id,
  -- Their real division if they have an entry, otherwise the one their
  -- declared PB would put them in. This is only ever a "Div N" badge on a
  -- national row — the national standing itself is not divided — so a free
  -- member being shown the division they would land in is the useful answer.
  -- It can still be null when no division covers their PB, which is why
  -- league_table_with_ghost left-joins divisions below.
  coalesce(
    (
      select se.division_id
      from season_entries se
      where se.angler_id = t.angler_id
        and se.season_id = t.season_id
        and se.left_at is null
      order by se.joined_at desc
      limit 1
    ),
    (public.division_for_pb(t.season_id, p.declared_pb_oz)).id
  ) as division_id,
  t.total_points,
  t.counting_fish,
  t.best_fish_oz,
  rank() over (
    partition by t.season_id
    order by t.total_points desc
  ) as position
from totals t
join profiles p on p.id = t.angler_id;

-- ---------------------------------------------------------------------------
-- league_table_with_ghost: the national branch no longer needs a ghost, and
-- must not drop anglers whose division could not be resolved.
--
-- The division branch is byte-for-byte what 20260806030000 left it as. Only
-- the national branch and the ghost's guard have changed.
-- ---------------------------------------------------------------------------
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
  -- out. Ties share a number, which is what rank() did before.
  if p_division_id is not null then
    return query
    with base as (
      select
        l.angler_id,
        l.division_id,
        l.total_points  as national_points,
        l.counting_fish as national_fish,
        l.best_fish_oz  as national_best,
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
    -- here now, paid or free, so there is no ghost to append and no row is
    -- greyed out: is_ghost is false for all of them.
    --
    -- Left join, because division_id is null for an angler whose declared PB
    -- matches no division. An inner join dropped exactly the anglers this
    -- migration exists to include.
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
  -- row at all. They never reach league_table, so their score is
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
