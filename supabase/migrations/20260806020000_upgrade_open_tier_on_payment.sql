-- ===========================================================================
-- Paying upgrades an existing free entry instead of being ignored.
--
-- apply_membership() looked for "an open stint" and treated finding one as
-- "already a competitor". That is only true if the open stint is a paid one.
--
-- Members who joined before paid membership existed hold an `open`-tier
-- season_entries row with left_at null — a perfectly ordinary free member in
-- the league. That row is an open stint, so when their payment arrived the
-- function said "already a competitor" and did nothing at all: subscription
-- active, tier still `open`. The join page reported success, because it reads
-- subscriptions, while the league strip, the upsell and the gold ring all
-- read season_entries and went on treating them as unpaid.
--
-- Silent, and in the worst direction — the member has been charged.
--
-- Fixed by testing the tier as well as the stint. An open non-paying entry is
-- closed and a competitor stint opened alongside it, rather than the tier
-- being edited in place: their free period and their paid period are
-- different things and the boundary between them is exactly what decides
-- which fish count. Editing the tier would retroactively make months of free
-- fishing look paid.
--
-- The ranges are '[)', so closing at now() and opening at now() do not
-- overlap and the exclusion constraint is satisfied.
-- ===========================================================================

create or replace function public.apply_membership(p_angler_id uuid, p_status text)
returns table (season_id uuid, outcome text)
language plpgsql security definer set search_path = public as $$
declare
  v_season    seasons%rowtype;
  v_paid      boolean := public.is_paying_status(p_status);
  v_open_id   uuid;
  v_open_tier text;
  v_division  divisions%rowtype;
  v_pb        integer;
begin
  select * into v_season
    from seasons where status = 'running'
    order by starts_on desc limit 1;

  if v_season.id is null then
    return query select null::uuid, 'no running season';
    return;
  end if;

  select se.id, se.tier into v_open_id, v_open_tier
    from season_entries se
    where se.angler_id = p_angler_id
      and se.season_id = v_season.id
      and se.left_at is null
    limit 1;

  if v_paid then
    -- Already paying: nothing to do. This is the idempotent path, and it
    -- has to stay cheap because Stripe may deliver the same event twice.
    if v_open_id is not null and v_open_tier = 'competitor' then
      return query select v_season.id, 'already a competitor';
      return;
    end if;

    -- In the league but not paying. Close that period before opening the
    -- paid one, so the two never overlap and the fish logged in each stay
    -- attributed to the right one.
    if v_open_id is not null then
      update season_entries set left_at = now() where id = v_open_id;
    end if;

    select p.declared_pb_oz into v_pb from profiles p where p.id = p_angler_id;
    v_division := public.division_for_pb(v_season.id, v_pb);
    if v_division.id is null then
      raise exception 'no division covers a PB of % in season %', v_pb, v_season.name
        using errcode = '22023';
    end if;

    insert into season_entries (season_id, angler_id, division_id, tier, joined_at)
    values (v_season.id, p_angler_id, v_division.id, 'competitor', now());

    perform private.admin_audit('membership_started', 'season_entries', p_angler_id,
      jsonb_build_object('season', v_season.name, 'division', v_division.name,
                         'stripe_status', p_status,
                         'upgraded_from_tier', v_open_tier));
    return query select v_season.id, 'stint opened';
  else
    -- Only a paid stint can lapse. An open `open`-tier row is a free member
    -- sitting in the league and has nothing to close.
    if v_open_id is null or v_open_tier <> 'competitor' then
      return query select v_season.id, 'already unpaid';
      return;
    end if;

    update season_entries set left_at = now() where id = v_open_id;

    perform private.admin_audit('membership_lapsed', 'season_entries', p_angler_id,
      jsonb_build_object('season', v_season.name, 'stripe_status', p_status));
    return query select v_season.id, 'stint closed';
  end if;
end; $$;

revoke all on function public.apply_membership(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_membership(uuid, text) to service_role;
