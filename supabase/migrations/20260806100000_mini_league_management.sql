-- ===========================================================================
-- Managing a mini league after it is created: delete it, rename it, add and
-- remove members — and join one with its code.
--
-- The last of those closes a gap I opened. Creation was moved behind
-- create_mini_league() and the self-insert policy on mini_league_members was
-- dropped with it, which left the join code shown on every league's card with
-- nothing able to redeem it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Deleting is the owner's, and only the owner's.
--
-- mini_league_members cascades, so the membership goes with it. Everyone else
-- already has "users leave mini leagues" for removing themselves.
-- ---------------------------------------------------------------------------
drop policy if exists "owners delete own mini leagues" on mini_leagues;
create policy "owners delete own mini leagues"
  on mini_leagues for delete
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Renaming stays a plain update, but ownership must not be part of it.
--
-- The policy had no WITH CHECK, so an owner could hand the league to somebody
-- else — or to nobody — in the same statement that renamed it. Reading and
-- writing now both require being the owner, so the row cannot be edited out
-- of your own hands.
-- ---------------------------------------------------------------------------
alter policy "owners edit own mini leagues" on mini_leagues
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- The owner adds more anglers.
--
-- SECURITY DEFINER for the same reason create_mini_league is: adding somebody
-- else to a league is exactly what the self-insert policy refuses. Gated on
-- ownership here rather than by a policy saying "or you own the league",
-- which would also let an owner be added to by anyone who could forge the id.
-- ---------------------------------------------------------------------------
create or replace function public.add_mini_league_members(
  p_mini_league_id uuid,
  p_member_ids     uuid[]
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_added integer;
begin
  if not exists (
    select 1 from mini_leagues m
    where m.id = p_mini_league_id and m.owner_id = auth.uid()
  ) then
    raise exception 'only the owner can add members' using errcode = '42501';
  end if;

  insert into mini_league_members (mini_league_id, angler_id)
  select p_mini_league_id, x.angler_id
  from unnest(p_member_ids) as x(angler_id)
  join profiles p on p.id = x.angler_id
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end; $$;

revoke all on function public.add_mini_league_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_mini_league_members(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Removing someone. The owner may remove anyone; anyone may remove
-- themselves. The owner cannot remove themselves while they still own it —
-- that would leave a league nobody can administer. They delete it instead.
-- ---------------------------------------------------------------------------
create or replace function public.remove_mini_league_member(
  p_mini_league_id uuid,
  p_angler_id      uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select m.owner_id into v_owner from mini_leagues m where m.id = p_mini_league_id;
  if v_owner is null then
    raise exception 'mini league not found' using errcode = 'P0002';
  end if;

  if auth.uid() <> v_owner and auth.uid() <> p_angler_id then
    raise exception 'only the owner can remove other members' using errcode = '42501';
  end if;

  if p_angler_id = v_owner then
    raise exception 'OWNER_CANNOT_LEAVE: delete the league instead'
      using errcode = '22023';
  end if;

  delete from mini_league_members
  where mini_league_id = p_mini_league_id and angler_id = p_angler_id;
end; $$;

revoke all on function public.remove_mini_league_member(uuid, uuid) from public, anon;
grant execute on function public.remove_mini_league_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Joining with a code.
--
-- Matched case-insensitively because a code that has been read out over the
-- phone gets typed however the person feels. Returns the league so the caller
-- can go straight to it; a wrong code is told so plainly rather than silently
-- doing nothing.
-- ---------------------------------------------------------------------------
create or replace function public.join_mini_league(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;

  select m.id into v_id
  from mini_leagues m
  where upper(trim(m.join_code)) = upper(trim(p_code));

  if v_id is null then
    raise exception 'NO_SUCH_LEAGUE: no mini league has that code'
      using errcode = 'P0002';
  end if;

  insert into mini_league_members (mini_league_id, angler_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end; $$;

revoke all on function public.join_mini_league(text) from public, anon;
grant execute on function public.join_mini_league(text) to authenticated, service_role;
