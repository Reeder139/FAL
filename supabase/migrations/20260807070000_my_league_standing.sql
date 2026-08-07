-- ===========================================================================
-- Both of the caller's standings, in one call.
--
-- The League Position strip now shows two: the national placing on the left
-- and the divisional one on the right. Assembling that client-side meant four
-- round trips and re-deriving the divisional rank in TypeScript, when the
-- ranking rule — paid entries only, by points — already exists in SQL and has
-- to agree with what league_table_with_ghost draws on the league page.
--
-- Returns up to two rows. No national row means no qualifying fish this
-- season; no division row means no paid standing, which is the ordinary case
-- for a free member and is what the strip turns into the join prompt.
-- ===========================================================================
create or replace function public.my_league_standing()
returns table (
  scope         text,
  -- `position` is reserved in a RETURNS TABLE clause — POSITION(x IN y) is a
  -- SQL function. league_table_with_ghost hit the same wall and settled on
  -- this name, so it is the one the client already knows.
  position_in_table integer,
  total_points  numeric,
  member_count  integer,
  division_name text,
  delta         integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_season seasons%rowtype;
begin
  if v_caller is null then
    return;
  end if;
  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  return query
  select
    'national'::text,
    n.position::integer,
    n.total_points,
    (select count(*)::integer from national_league_table x where x.season_id = v_season.id),
    null::text,
    public.league_position_delta(v_caller, 'national')
  from national_league_table n
  where n.season_id = v_season.id and n.angler_id = v_caller;

  return query
  with ranked as (
    select
      dl.angler_id,
      dl.division_id,
      dl.total_points,
      rank() over (partition by dl.division_id order by dl.total_points desc)::integer as position,
      count(*) over (partition by dl.division_id)::integer as member_count
    from division_league_table dl
    where dl.season_id = v_season.id
  )
  select
    'division'::text,
    r.position,
    r.total_points,
    r.member_count,
    d.name,
    public.league_position_delta(v_caller, 'division')
  from ranked r
  join divisions d on d.id = r.division_id
  where r.angler_id = v_caller;
end; $$;

revoke all on function public.my_league_standing() from public, anon;
grant execute on function public.my_league_standing() to authenticated, service_role;
