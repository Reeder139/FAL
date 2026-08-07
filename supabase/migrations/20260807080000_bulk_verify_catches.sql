-- ===========================================================================
-- Verifying a batch of catches in one go.
--
-- Comped staff accounts mean a review queue full of fish from people who are
-- plainly not cheating, and clearing them one at a time is the bottleneck.
-- This does a selected set together, under one reason.
--
-- It calls verify_catch() per id rather than reimplementing it. That function
-- is the one that writes the catch_reviews row the status trigger acts on,
-- and the audit row that gates it — duplicating any of that here would be a
-- second definition of what verifying means, free to drift from the first.
-- Being one statement, it is also one transaction: the batch lands whole or
-- not at all, and a bad id fails the lot rather than half-applying it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Position recording gets deferred while a batch runs.
--
-- The standings trigger is statement-level on `catches`, and each verify
-- writes its own catch_reviews row, so a batch of twenty would recompute the
-- league twenty times and — far worse — raise a round of "you were overtaken"
-- notifications at every intermediate step. Those movements never happened:
-- they are artefacts of the order the batch was applied in.
--
-- So the recorder no-ops while the flag is set, and the batch calls it once at
-- the end. Each angler then gets one notification describing the net move,
-- which is the only move that was ever real.
--
-- Transaction-local (`set_config(..., true)`), like app.admin_actor: the
-- connection is pooled, and a session-level flag would silently disable
-- position recording for whoever used that connection next.
-- ---------------------------------------------------------------------------
create or replace function public.record_league_positions()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons%rowtype;
begin
  if coalesce(current_setting('app.defer_position_recording', true), 'off') = 'on' then
    return;
  end if;

  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  with
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
    where p.position is null or p.position <> c.position
  ),
  written as (
    insert into league_position_history
      (season_id, angler_id, scope, division_id, position, total_points)
    select v_season.id, ch.angler_id, ch.scope, ch.division_id, ch.position, ch.total_points
    from changed ch
    returning angler_id, scope
  )
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
-- The batch itself.
--
-- Returns how many were actually verified. Catches already at `verified` are
-- skipped rather than re-reviewed: a second review row saying "verified" adds
-- no evidence, and the count coming back lower than the number ticked is how
-- the console reports that.
-- ---------------------------------------------------------------------------
create or replace function public.verify_catches(
  p_catch_ids uuid[],
  p_reason    text
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_count   integer := 0;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if p_catch_ids is null or array_length(p_catch_ids, 1) is null then
    raise exception 'no catches selected' using errcode = '22023';
  end if;

  perform set_config('app.defer_position_recording', 'on', true);

  for v_id in
    select c.id from catches c
    where c.id = any(p_catch_ids)
      and c.status is distinct from 'verified'
  loop
    perform public.verify_catch(v_id, p_reason);
    v_count := v_count + 1;
  end loop;

  -- One recompute for the whole batch, and with it one notification per
  -- angler describing where they actually ended up.
  perform set_config('app.defer_position_recording', 'off', true);
  perform public.record_league_positions();

  return v_count;
end; $$;

revoke all on function public.verify_catches(uuid[], text) from public, anon;
grant execute on function public.verify_catches(uuid[], text) to service_role, authenticated;
