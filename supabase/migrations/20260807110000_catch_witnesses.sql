-- ===========================================================================
-- Witnessed catches.
--
-- An angler can nominate another member to vouch that they saw the fish and
-- the weight. The witness is asked, in their Activity feed, and answers yes or
-- no. What comes out is a signed statement attached to the catch: who
-- attested, to what weight, and when.
--
-- Three decisions worth stating, because they are what make this evidence
-- rather than decoration:
--
-- 1. A confirmation does NOT verify the catch or raise its evidence tier.
--    Two members who trust each other could otherwise wave anything through,
--    and the prize fund is the thing on the other side of that. The
--    attestation is recorded and shown; deciding what it is worth stays with
--    whoever reviews the catch.
--
-- 2. One witness per catch, enforced by catch_id being the primary key. Not a
--    limitation — it is the point. If a decline could be followed by asking
--    someone else, the record would only ever show the answer the angler
--    liked, and "witnessed" would mean "witnessed eventually, by whoever
--    agreed".
--
-- 3. The weight is copied onto the nomination. Catches already have no update
--    policy for anglers — once submitted, a weight is evidence — so this
--    cannot drift, and having it here makes the attestation readable on its
--    own: "X confirmed 32 lb 4 oz", not "X confirmed whatever that row says
--    now".
--
-- A decline is kept, not deleted. Someone saying they did not see it is worth
-- more to a reviewer than silence, and deleting it would make refusing to
-- vouch indistinguishable from never being asked.
-- ===========================================================================

create table if not exists catch_witnesses (
  -- One per catch. See note 2 above.
  catch_id     uuid primary key references catches(id) on delete cascade,
  witness_id   uuid not null references profiles(id) on delete cascade,
  nominated_by uuid not null references profiles(id) on delete cascade,
  -- What they are being asked to stand behind, as submitted.
  weight_oz    integer not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'declined')),
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  -- A witness cannot be the angler. Also enforced in nominate_witness with a
  -- readable error; here so it holds whatever writes the row.
  constraint catch_witnesses_not_self check (witness_id <> nominated_by)
);

create index if not exists catch_witnesses_witness_idx
  on catch_witnesses (witness_id, status, created_at desc);
create index if not exists catch_witnesses_nominator_idx
  on catch_witnesses (nominated_by, created_at desc);

alter table catch_witnesses enable row level security;

-- Readable by all, like the catch it belongs to. The point of an attestation
-- is that other people can see it — it is shown on the counting-fish page,
-- which exists so the membership can scrutinise the fish deciding a table.
create policy "witness statements readable by all"
  on catch_witnesses for select using (true);

-- No insert or update policy on purpose. Both go through the functions below,
-- which is what stops an angler writing themselves a confirmation.

-- ---------------------------------------------------------------------------
-- Ask someone to witness a catch.
--
-- The witness must be a paying member. Not gatekeeping for its own sake: a
-- paid member has a season entry, a division and something to lose if they
-- vouch for a fish that turns out to be invented. A free account costs
-- nothing to make and nothing to abandon, which is exactly the wrong property
-- for a corroborating signature.
--
-- The angler doing the nominating need not be paid. Their fish counts in the
-- national table either way, so their catch can be corroborated either way.
-- ---------------------------------------------------------------------------
create or replace function public.nominate_witness(
  p_catch_id   uuid,
  p_witness_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_catch  catches%rowtype;
begin
  if v_caller is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;

  select * into v_catch from catches where id = p_catch_id;
  if not found then
    raise exception 'no such catch' using errcode = 'P0002';
  end if;
  if v_catch.angler_id <> v_caller then
    raise exception 'you can only nominate a witness for your own catch'
      using errcode = '42501';
  end if;
  if p_witness_id = v_caller then
    raise exception 'you cannot witness your own catch' using errcode = '22023';
  end if;
  if not public.is_paid_member(p_witness_id) then
    raise exception 'a witness must be a paid member' using errcode = '22023';
  end if;
  if exists (select 1 from catch_witnesses w where w.catch_id = p_catch_id) then
    raise exception 'this catch already has a witness' using errcode = '23505';
  end if;

  insert into catch_witnesses (catch_id, witness_id, nominated_by, weight_oz)
  values (p_catch_id, p_witness_id, v_caller, v_catch.weight_oz);
end; $$;

-- ---------------------------------------------------------------------------
-- The witness answers.
--
-- Only the nominated witness, and only once. A statement that could be
-- revised is not a statement — if they answered wrongly, that is a
-- conversation for a reviewer, and the original answer stays on the record.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_witness_request(
  p_catch_id  uuid,
  p_confirmed boolean
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_row    catch_witnesses%rowtype;
begin
  if v_caller is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;

  select * into v_row from catch_witnesses where catch_id = p_catch_id;
  if not found then
    raise exception 'no witness request for this catch' using errcode = 'P0002';
  end if;
  if v_row.witness_id <> v_caller then
    raise exception 'this request is not yours to answer' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'you have already answered this request' using errcode = '22023';
  end if;

  update catch_witnesses
     set status = case when p_confirmed then 'confirmed' else 'declined' end,
         responded_at = now()
   where catch_id = p_catch_id;
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.nominate_witness(uuid,uuid)',
    'public.respond_to_witness_request(uuid,boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
