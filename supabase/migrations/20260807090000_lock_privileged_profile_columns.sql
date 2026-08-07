-- ===========================================================================
-- An angler can no longer make themselves an admin.
--
-- profiles' update policy is `using (auth.uid() = id)` and nothing more. An
-- UPDATE policy with only a USING clause has that same expression applied as
-- its WITH CHECK, so it decides *which rows* you may write and says nothing
-- about *which columns*. `auth.uid() = id` still holds after setting
-- is_admin = true, and no trigger or column privilege stood in the way.
--
-- So any signed-in angler could promote themselves with one ordinary update
-- against their own row. From there is_admin() returns true, and every admin
-- function is already granted to `authenticated` and gated on
-- admin_audit(), which accepts is_admin() — verify catches, comp
-- memberships, suspend members, rewrite a season's scoring. Someone could
-- comp themselves and verify their own fish into the grand prize.
--
-- The same policy left three other columns writable that decide trust rather
-- than describe the angler: pb_verified (which division they seed into, and
-- the whole anti-sandbagging rule), identity_verified, and suspended_at —
-- a suspended member could simply clear their own suspension.
--
-- Fixed with column privileges rather than a trigger. The engine enforces
-- them, there is no function to keep in step with the column list, and the
-- failure mode is a permission error rather than a silently ignored write.
-- ===========================================================================

-- Table-level UPDATE has to go first. A column-level REVOKE does nothing
-- while the role still holds UPDATE on the table as a whole — Postgres reads
-- the table grant as covering every column, including ones revoked
-- individually. Supabase grants ALL on public tables to these roles by
-- default, so that table-level grant is exactly what was there.
revoke update on profiles from authenticated, anon;

-- A whitelist, not a blacklist. Everything an angler legitimately edits about
-- themselves is named here; anything else — now or added later — is locked
-- unless somebody deliberately opens it. A new `is_moderator` column six
-- months from now defaults to safe rather than to exploitable.
--
-- Cross-checked against every write the app makes: avatar_path from the
-- profile screen, fair_play_accepted_at from the fair play gate, and
-- declared_pb_oz plus avatar_path from onboarding. The rest are here because
-- they describe the angler and nobody else has an opinion about them.
grant update (
  username,
  display_name,
  avatar_path,
  bio,
  postcode_district,
  declared_pb_oz,
  pb_evidence_path,
  country,
  fair_play_accepted_at,
  activity_read_at
) on profiles to authenticated;

-- Deliberately NOT granted, and why:
--   is_admin           privilege escalation, the hole this closes
--   pb_verified        decides division seeding and defeats anti-sandbagging
--   identity_verified  a trust signal the angler must not assert about itself
--   suspended_at       a suspended member could lift their own suspension
--   follower_count     maintained by bump_follow_counters, which is security
--   following_count      definer and so unaffected by these grants
--   id, created_at     identity and history; nothing should rewrite them

-- ---------------------------------------------------------------------------
-- Making somebody an admin, properly.
--
-- There was no way to do this at all before — no function, no console query,
-- nothing. The only route was writing the column by hand, which is what the
-- console's one rule exists to stop: no gate, no audit row, and no record of
-- who handed out the keys.
--
-- Note that admin is not the only way to administer: admin_audit() also
-- accepts service_role, which is how the Retool console works. That is why
-- there is no "last admin" guard here — revoking the final admin cannot lock
-- anyone out, because the console never depended on the flag.
-- ---------------------------------------------------------------------------
create or replace function public.grant_admin(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  perform private.admin_audit('grant_admin', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set is_admin = true where id = p_user_id;
  if not found then
    raise exception 'no such angler: %', p_user_id using errcode = 'P0002';
  end if;
end; $$;

create or replace function public.revoke_admin(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  perform private.admin_audit('revoke_admin', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set is_admin = false where id = p_user_id;
  if not found then
    raise exception 'no such angler: %', p_user_id using errcode = 'P0002';
  end if;
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.grant_admin(uuid,text)',
    'public.revoke_admin(uuid,text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role, authenticated', fn);
  end loop;
end $$;
