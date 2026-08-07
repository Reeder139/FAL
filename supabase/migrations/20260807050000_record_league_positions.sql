-- ===========================================================================
-- Recording positions, and noticing who passed whom.
--
-- Runs whenever a catch changes the standings. Compares the league as it is
-- now against the last recorded state, writes a history row for every angler
-- who moved, and raises a notification for each one.
--
-- Statement-level, not per row: verifying ten catches in one statement should
-- recompute the league once, not ten times. The whole league is a few hundred
-- rows, so recomputing it outright is cheaper and far simpler than working out
-- which anglers a given catch could have displaced — which is every angler
-- below the catch's owner anyway.
-- ===========================================================================

create or replace function public.record_league_positions()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons%rowtype;
begin
  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  with
  -- Where everyone stands right now, in both competitions. The national
  -- table already ranks itself; the divisional one is ranked here, over paid
  -- entries only, which is what league_table_with_ghost numbers on screen.
  current_positions as (
    select n.angler_id, 'national'::text as scope, null::uuid as division_id,
           n.position::integer as position, n.total_points
    from national_league_table n
    where n.season_id = v_season.id
    union all
    select dl.angler_id, 'division', dl.division_id,
           rank() over (partition by dl.division_id order by dl.total_points desc)::integer,
           dl.total_points
    from division_league_table dl
    where dl.season_id = v_season.id
  ),
  -- The last thing recorded for each angler and scope. distinct on is the
  -- cheap "latest row per group" against the descending index.
  previous_positions as (
    select distinct on (h.angler_id, h.scope)
           h.angler_id, h.scope, h.position, h.division_id
    from league_position_history h
    where h.season_id = v_season.id
    order by h.angler_id, h.scope, h.recorded_at desc
  ),
  changed as (
    select c.*, p.position as previous_position
    from current_positions c
    left join previous_positions p
      on p.angler_id = c.angler_id and p.scope = c.scope
    -- A first sighting counts as a change: it is how an angler gets their
    -- opening row. It raises no notification, though — see below.
    where p.position is null or p.position <> c.position
  ),
  written as (
    insert into league_position_history
      (season_id, angler_id, scope, division_id, position, total_points)
    select v_season.id, ch.angler_id, ch.scope, ch.division_id, ch.position, ch.total_points
    from changed ch
    returning angler_id, scope
  )
  -- Notifications, from the same comparison. Nothing for a first sighting:
  -- an angler entering the table has not moved, and telling them they were
  -- overtaken on their first ever catch would be nonsense.
  insert into league_position_events
    (angler_id, season_id, scope, kind, from_position, to_position, other_angler_id)
  select
    ch.angler_id,
    v_season.id,
    ch.scope,
    case when ch.position < ch.previous_position then 'moved_up' else 'overtaken' end,
    ch.previous_position,
    ch.position,
    case
      when ch.position < ch.previous_position then null
      else (
        -- Who passed them: an angler who was behind before and is ahead now.
        -- The nearest such — the one now immediately in front — is the one
        -- worth naming. Null when nobody passed them directly and they
        -- slipped because the table rearranged around them.
        select other.angler_id
        from current_positions other
        join previous_positions prev_other
          on prev_other.angler_id = other.angler_id and prev_other.scope = other.scope
        where other.scope = ch.scope
          and other.angler_id <> ch.angler_id
          and prev_other.position > ch.previous_position
          and other.position < ch.position
          and (ch.scope = 'national' or other.division_id = ch.division_id)
        order by other.position desc
        limit 1
      )
    end
  from changed ch
  where ch.previous_position is not null;
end; $$;

revoke all on function public.record_league_positions() from public, anon;
grant execute on function public.record_league_positions() to service_role;

-- ---------------------------------------------------------------------------
-- Fired by the thing that moves the standings: a catch appearing, or its
-- status changing. Scoring counts `verified` catches only, so a rejection is
-- as much a change as a verification.
--
-- Statement-level and unconditional. A row-level `when` clause would have to
-- be evaluated per row and would still call this once per row.
-- ---------------------------------------------------------------------------
create or replace function public.catches_changed_standings()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.record_league_positions();
  return null;
end; $$;

drop trigger if exists catches_record_positions on catches;
create trigger catches_record_positions
  after insert or update or delete on catches
  for each statement
  execute function public.catches_changed_standings();
