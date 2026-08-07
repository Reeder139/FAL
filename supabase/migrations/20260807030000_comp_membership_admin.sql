-- ===========================================================================
-- Comping a member to full membership, from the admin console.
--
-- Beta testers and the Atomic Tackle team get membership without paying for
-- it. Until now that meant someone editing season_entries by hand, which is
-- exactly what the console's one rule exists to stop: no gate, no audit row,
-- and nothing recording who granted a paid place or why.
--
-- A comp is deliberately not a fake subscription. Every paid-member surface in
-- the app — is_paid_member(), the gold ring, mini-league creation, the
-- divisional tables — reads a `competitor` stint in season_entries.
-- `subscriptions` is only ever Stripe's own record of money changing hands, so
-- a comped member correctly has no row in it, sees no billing card, and is
-- not offered a subscription they already have.
--
-- Because there is no subscription behind it, nothing ever ends a comp on its
-- own: the Stripe webhook only acts on anglers Stripe knows about. That is the
-- point — a comp lasts the season — and it is why end_membership exists below.
-- ===========================================================================

/**
 * Grant membership without payment.
 *
 * `p_backdate` decides whether the fish they have already caught this season
 * count towards their division. It is a real decision, not a detail:
 *
 *   false — they are a competitor from now. Earlier fish keep counting in the
 *           national table, where every angler's best fish count regardless,
 *           but score nothing towards the division's cash prize.
 *   true  — backdated to the season's start, so everything they have caught
 *           this season counts in the division too. This deliberately grants
 *           what the "paid fish only" rule normally prevents, which is why it
 *           has to be asked for explicitly rather than being the default.
 *
 * Backdating never reaches into a period the angler had already left: the
 * start is clamped to the end of their most recent closed stint. Otherwise the
 * new stint would overlap it and the exclusion constraint would reject the
 * whole thing with a message about ranges.
 */
create or replace function public.comp_membership(
  p_user_id  uuid,
  p_backdate boolean,
  p_reason   text
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_season     seasons%rowtype;
  v_division   divisions%rowtype;
  v_pb         integer;
  v_open_id    uuid;
  v_open_tier  text;
  v_last_out   timestamptz;
  v_joined     timestamptz;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    raise exception 'no season is running today' using errcode = 'P0002';
  end if;

  select se.id, se.tier into v_open_id, v_open_tier
    from season_entries se
   where se.angler_id = p_user_id
     and se.season_id = v_season.id
     and se.left_at is null;

  -- Idempotent: comping someone who is already a competitor changes nothing,
  -- whether they got there by paying or by an earlier comp. Still audited —
  -- that an admin tried is worth knowing.
  if v_open_tier = 'competitor' then
    perform private.admin_audit('comp_membership', 'season_entries', p_user_id,
      jsonb_build_object('season', v_season.name, 'result', 'already a competitor',
                         'reason', p_reason));
    return 'already a competitor';
  end if;

  select p.declared_pb_oz into v_pb from profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no such angler: %', p_user_id using errcode = 'P0002';
  end if;

  -- Same seeding rule as paying: the declared PB picks the division.
  v_division := public.division_for_pb(v_season.id, v_pb);
  if v_division.id is null then
    raise exception 'no division covers a PB of % in season %', v_pb, v_season.name
      using errcode = '22023';
  end if;

  if p_backdate then
    select max(se.left_at) into v_last_out
      from season_entries se
     where se.angler_id = p_user_id
       and se.season_id = v_season.id
       and se.left_at is not null;
    v_joined := greatest(v_season.starts_on::timestamptz, coalesce(v_last_out, '-infinity'::timestamptz));
  else
    v_joined := now();
  end if;

  perform private.admin_audit('comp_membership', 'season_entries', p_user_id,
    jsonb_build_object(
      'season', v_season.name,
      'division', v_division.name,
      'backdated', p_backdate,
      'joined_at', v_joined,
      'upgraded_from_tier', v_open_tier,
      'reason', p_reason
    ));

  if v_open_id is not null then
    -- Convert the stint they are already in rather than closing it and
    -- opening another. Closing at now() and inserting one from the season's
    -- start would overlap, and the exclusion constraint would refuse it.
    update season_entries
       set tier        = 'competitor',
           division_id = v_division.id,
           joined_at   = least(joined_at, v_joined)
     where id = v_open_id;
  else
    insert into season_entries (season_id, angler_id, division_id, tier, joined_at)
    values (v_season.id, p_user_id, v_division.id, 'competitor', v_joined);
  end if;

  return case when p_backdate then 'comped from season start' else 'comped from today' end;
end; $$;

/**
 * End a membership early — the undo for a comp.
 *
 * Closes the open competitor stint, which is exactly what apply_membership
 * does when Stripe reports a subscription has lapsed, so a revoked comp and a
 * lapsed subscription leave the database in the same shape.
 *
 * Safe to use on a paying member, but it does not cancel anything at Stripe:
 * they keep being charged and the next webhook re-opens a stint. Cancel in
 * Stripe, or have the member use the billing portal.
 */
create or replace function public.end_membership(
  p_user_id uuid,
  p_reason  text
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_season  seasons%rowtype;
  v_open_id uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    raise exception 'no season is running today' using errcode = 'P0002';
  end if;

  select se.id into v_open_id
    from season_entries se
   where se.angler_id = p_user_id
     and se.season_id = v_season.id
     and se.tier = 'competitor'
     and se.left_at is null;

  perform private.admin_audit('end_membership', 'season_entries', p_user_id,
    jsonb_build_object('season', v_season.name, 'reason', p_reason,
                       'result', case when v_open_id is null then 'not a competitor' else 'stint closed' end));

  if v_open_id is null then
    return 'not a competitor';
  end if;

  update season_entries set left_at = now() where id = v_open_id;
  return 'stint closed';
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.comp_membership(uuid,boolean,text)',
    'public.end_membership(uuid,text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role, authenticated', fn);
  end loop;
end $$;
