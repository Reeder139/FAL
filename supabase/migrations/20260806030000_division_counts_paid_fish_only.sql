-- ===========================================================================
-- Fish caught before you paid do not count in the divisional table.
--
-- The divisional tables are the cash-prize competition. league_table counts
-- every fish inside any season_entries stint, paid or free, and both tables
-- were reading it — so a member could fish free all summer, subscribe for one
-- month in September, and carry the whole summer's haul into a £1,500
-- division. Reproduced before writing this: a free member with three big
-- fish in May, June and July paid today and immediately held first place in
-- their division on 134 points, of which 118 were caught while not paying.
--
-- The national table is deliberately unchanged. It is bragging rights with
-- no prize attached, every member is genuinely in that standing, and every
-- qualifying fish they caught this season belongs in it.
--
-- So the two tables now answer different questions and will legitimately
-- show different totals and different counting fish for the same angler.
-- That is the point, and it is why the divisional pages carry a line saying
-- so.
--
-- division_scored_catches is scored_catches restricted to `competitor`
-- stints, ranked within itself: the cap of 5 (or 3 in winter) has to apply to
-- the paid fish, not be inherited from a national ranking that a pre-join
-- fish already occupies.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Paid-stint scoring. Same shape as scored_catches, one extra join condition.
-- ---------------------------------------------------------------------------
create or replace view division_scored_catches
with (security_invoker = on) as
select
  c.id            as catch_id,
  c.angler_id,
  se.season_id,
  se.division_id,
  c.weight_oz,
  c.caught_at,
  fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
             s.scoring_exponent, s.min_qualifying_oz)
    * case when c.is_pb then s.pb_bonus_multiplier else 1 end
    * case when c.fish_name is not null then s.named_fish_multiplier else 1 end
                  as points,
  row_number() over (
    partition by c.angler_id, se.season_id
    order by fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
                        s.scoring_exponent, s.min_qualifying_oz) desc,
             c.caught_at asc
  )               as rank_in_season
from catches c
join season_entries se on se.angler_id = c.angler_id
                      and se.tier = 'competitor'
join seasons s         on s.id = se.season_id
where c.status = 'verified'
  and c.caught_at::date between s.starts_on and s.ends_on
  and c.caught_at >= se.joined_at
  and (se.left_at is null or c.caught_at < se.left_at);

-- ---------------------------------------------------------------------------
-- Top counting_fish of those. No rank() window: the position is worked out in
-- league_table_with_ghost, which has to number paid rows against each other.
-- ---------------------------------------------------------------------------
create or replace view division_league_table
with (security_invoker = on) as
select
  sc.season_id,
  sc.division_id,
  sc.angler_id,
  sum(sc.points)    as total_points,
  count(*)          as counting_fish,
  max(sc.weight_oz) as best_fish_oz
from division_scored_catches sc
join seasons s on s.id = sc.season_id
where sc.rank_in_season <= s.counting_fish
group by sc.season_id, sc.division_id, sc.angler_id;

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
