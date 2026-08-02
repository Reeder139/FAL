-- ============================================================================
-- League summary strip: hypothetical league position for anglers with no
-- season_entries row.
--
-- hypothetical_catch_preview (20260802030000) already computes almost this
-- exact thing, keyed off one catch. Extracting the shared bits — "which
-- season", "which division for this PB", "hypothetical top-counting_fish
-- total" — into small functions so the new angler-level version (no catch
-- required) doesn't duplicate the logic, and hypothetical_catch_preview
-- itself is rewritten to call them instead of inlining it a second time.
-- ============================================================================

create or replace function public.season_for_date(p_date date)
returns seasons
language sql stable as $$
  select s.* from seasons s
  where p_date between s.starts_on and s.ends_on
    and s.status in ('open', 'running')
  order by s.starts_on desc
  limit 1;
$$;

create or replace function public.division_for_pb(p_season_id uuid, p_declared_pb_oz integer)
returns divisions
language sql stable as $$
  select d.* from divisions d
  where d.season_id = p_season_id
    and (d.min_pb_oz is null or coalesce(p_declared_pb_oz, 0) >= d.min_pb_oz)
    and (d.max_pb_oz is null or coalesce(p_declared_pb_oz, 0) <= d.max_pb_oz)
  limit 1;
$$;

-- Same "top counting_fish scored catches" cap league_table applies, just
-- computed without requiring a season_entries row to join through.
create or replace function public.hypothetical_season_total(p_angler_id uuid, p_season seasons)
returns numeric
language sql stable as $$
  with angler_catches as (
    select c.weight_oz, c.is_pb, c.fish_name
    from catches c
    where c.angler_id = p_angler_id
      and c.status = 'verified'
      and c.caught_at::date between p_season.starts_on and p_season.ends_on
  ),
  scored as (
    select
      fal_points(weight_oz, p_season.scoring_multiplier, p_season.scoring_offset_oz,
                 p_season.scoring_exponent, p_season.min_qualifying_oz)
        * case when is_pb then p_season.pb_bonus_multiplier else 1 end
        * case when fish_name is not null then p_season.named_fish_multiplier else 1 end as pts
    from angler_catches
    order by pts desc
    limit p_season.counting_fish
  )
  select coalesce(sum(pts), 0) from scored;
$$;


create or replace function public.hypothetical_catch_preview(p_catch_id uuid)
returns table (
  points                     numeric,
  hypothetical_season_total  numeric,
  division_id                uuid,
  division_name              text,
  division_member_count      integer,
  percentile                 numeric
)
language plpgsql stable as $$
declare
  v_catch    catches%rowtype;
  v_profile  profiles%rowtype;
  v_season   seasons%rowtype;
  v_division divisions%rowtype;
begin
  select * into v_catch from catches where id = p_catch_id;
  select * into v_profile from profiles where id = v_catch.angler_id;

  v_season := public.season_for_date(v_catch.caught_at::date);
  if v_season.id is null then
    return;
  end if;

  points := fal_points(v_catch.weight_oz, v_season.scoring_multiplier, v_season.scoring_offset_oz,
                        v_season.scoring_exponent, v_season.min_qualifying_oz)
            * case when v_catch.is_pb then v_season.pb_bonus_multiplier else 1 end
            * case when v_catch.fish_name is not null then v_season.named_fish_multiplier else 1 end;

  v_division := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  division_id := v_division.id;
  division_name := v_division.name;

  hypothetical_season_total := public.hypothetical_season_total(v_catch.angler_id, v_season);

  select count(*) into division_member_count
  from season_entries se
  where se.season_id = v_season.id and se.division_id = v_division.id;

  if division_member_count >= 20 then
    select 100.0 * count(*) filter (where lt.total_points < hypothetical_season_total) / count(*)
      into percentile
    from league_table lt
    where lt.season_id = v_season.id and lt.division_id = v_division.id;
  else
    percentile := null;
  end if;

  return next;
end;
$$;


-- For the league summary strip: an angler's *current* hypothetical
-- standing (not tied to one catch), for anglers with no season_entries
-- row. Returns an actual position (not a percentile band, unlike the catch
-- result card) — dropped by the client below 20 division members, same
-- threshold, different presentation.
create or replace function public.hypothetical_league_position(p_angler_id uuid)
returns table (
  season_id                 uuid,
  division_id                uuid,
  division_name              text,
  hypothetical_season_total  numeric,
  division_member_count      integer,
  hypothetical_position      integer
)
language plpgsql stable as $$
declare
  v_profile  profiles%rowtype;
  v_season   seasons%rowtype;
  v_division divisions%rowtype;
begin
  select * into v_profile from profiles where id = p_angler_id;

  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  v_division := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  if v_division.id is null then
    return;
  end if;

  season_id := v_season.id;
  division_id := v_division.id;
  division_name := v_division.name;

  hypothetical_season_total := public.hypothetical_season_total(p_angler_id, v_season);

  select count(*) into division_member_count
  from season_entries se
  where se.season_id = v_season.id and se.division_id = v_division.id;

  select 1 + count(*) into hypothetical_position
  from league_table lt
  where lt.season_id = v_season.id
    and lt.division_id = v_division.id
    and lt.total_points > hypothetical_season_total;

  return next;
end;
$$;
