-- ===========================================================================
-- Paid membership: the database half.
--
-- £8/month. Paying makes you a competitor; stopping drops you back to an
-- unpaid member and the fish you log while lapsed do not count.
--
-- Nothing here talks to Stripe. Stripe's webhook calls apply_membership()
-- with a status string and this decides what that means for the league, so
-- the competition rules live in the database next to the scoring they
-- affect, not in an edge function.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Paid membership is a set of stints, not a flag.
--
-- season_entries already carries joined_at and left_at, and scored_catches
-- already honours them:
--
--     and c.caught_at >= se.joined_at
--     and (se.left_at is null or c.caught_at < se.left_at)
--
-- So "catches logged while lapsed do not count" needs no new scoring logic
-- at all — it is a row per paid stint, and a catch counts if it falls inside
-- one. Subscribe in April, lapse in June, resubscribe in July, and June's
-- fish sit in the gap between two stints and score nothing, permanently,
-- without anything having to remember to exclude them.
--
-- The hazard is overlap, and it is worse than it looks. scored_catches joins
-- season_entries on angler_id alone and then filters by the season's dates,
-- so two overlapping stints in one season make every catch join twice and
-- count twice. There was no constraint of any kind on this table, so nothing
-- prevented it — it simply had not happened yet, because nothing created
-- entries automatically. A subscribe/lapse/resubscribe flow is exactly what
-- would have started.
--
-- An exclusion constraint rather than a unique key: unique (season_id,
-- angler_id) would forbid the second stint entirely and break the feature
-- this is here to support. What must be prevented is two stints that are
-- open at the same time, which is what && on the range says.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'season_entries_no_overlapping_stints'
  ) then
    alter table season_entries add constraint season_entries_no_overlapping_stints
      exclude using gist (
        season_id with =,
        angler_id with =,
        -- '[)' so a stint that ends at the instant the next begins is not an
        -- overlap. left_at null gives an unbounded range: the open stint.
        tstzrange(joined_at, left_at, '[)') with &&
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What Stripe knows, mirrored.
--
-- One row per angler — the primary key says so, because a second live
-- subscription for the same person is a billing mistake, not a state to
-- model. Stripe remains the source of truth for money; this exists so the
-- app can answer "is this member paid up" without a round trip, and so the
-- console can see arrears without anyone opening the Stripe dashboard.
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  angler_id              uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  -- Stripe's own vocabulary, stored verbatim. Deliberately not constrained
  -- to a list: Stripe has added statuses before and a CHECK here would turn
  -- that into a failing webhook and a member who paid but did not get in.
  -- is_paying_status() below is the single place that decides meaning.
  status                 text not null,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- Readable only by its owner. Nothing writes through the API — the webhook
-- runs as service_role, which bypasses RLS, and no angler should be able to
-- promote themselves by writing a status.
create policy "anglers read own subscription"
  on subscriptions for select
  using (auth.uid() = angler_id);

create index if not exists subscriptions_status_idx on subscriptions (status);

-- ---------------------------------------------------------------------------
-- Which Stripe statuses count as paid.
--
-- past_due is deliberately in. It means a payment failed and Stripe is
-- retrying, which it does over roughly two weeks before giving up. Treating
-- that as an immediate lapse would end an angler's season over an expired
-- card, days before their bank let the retry through. canceled and unpaid
-- are the real end of the road.
-- ---------------------------------------------------------------------------
create or replace function public.is_paying_status(p_status text)
returns boolean
language sql immutable as $$
  select p_status in ('active', 'trialing', 'past_due');
$$;

-- ---------------------------------------------------------------------------
-- Apply a subscription state to the running season.
--
-- Opens a stint when someone starts paying, closes it when they stop, and
-- does nothing when the state already matches — so the webhook can be
-- delivered twice, which Stripe explicitly says it may be, without opening
-- two stints or moving a left_at that was already set.
--
-- prize_eligible is deliberately NOT touched. Whether someone who was in a
-- prize position and then fell into arrears keeps that position is a
-- management decision, and encoding it here would make it automatically and
-- silently. The facts get surfaced in the console instead; a person decides.
-- ---------------------------------------------------------------------------
create or replace function public.apply_membership(p_angler_id uuid, p_status text)
returns table (season_id uuid, outcome text)
language plpgsql security definer set search_path = public as $$
declare
  v_season    seasons%rowtype;
  v_paid      boolean := public.is_paying_status(p_status);
  v_open_id   uuid;
  v_division  divisions%rowtype;
  v_pb        integer;
begin
  select * into v_season
    from seasons where status = 'running'
    order by starts_on desc limit 1;

  -- Between seasons there is nothing to join. The subscription still
  -- updates; it simply has nowhere to apply until a season opens.
  if v_season.id is null then
    return query select null::uuid, 'no running season';
    return;
  end if;

  select se.id into v_open_id
    from season_entries se
    where se.angler_id = p_angler_id
      and se.season_id = v_season.id
      and se.left_at is null
    limit 1;

  if v_paid then
    if v_open_id is not null then
      return query select v_season.id, 'already a competitor';
      return;
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
                         'stripe_status', p_status));
    return query select v_season.id, 'stint opened';
  else
    if v_open_id is null then
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
