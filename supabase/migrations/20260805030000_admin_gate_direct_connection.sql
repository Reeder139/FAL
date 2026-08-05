-- ===========================================================================
-- Let the admin functions be called over a direct database connection.
--
-- The console has to reach two things that do not live behind the same door:
--
--   private.catch_review_detail  — the private schema is not exposed through
--                                  the Data API, by design, so PostgREST
--                                  cannot see it at all.
--   the admin functions          — gated on auth.role() = 'service_role',
--                                  which only exists on a PostgREST request.
--
-- So a REST connection can call the functions but not read the review view,
-- and a direct Postgres connection can read the view but was refused by
-- every function. Neither alone was enough to run a console with, which was
-- a gap in the original build rather than a Retool quirk.
--
-- A direct session authenticating as postgres or service_role is already
-- trusted with far more than these functions expose — it can write the
-- tables underneath them — so accepting it here loses nothing. What it would
-- have lost is the audit trail, since auth.uid() is null on such a
-- connection: see app.admin_actor below.
-- ===========================================================================

create or replace function private.admin_audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_detail       jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role   text := coalesce(auth.role(), '');
  v_db_role    text := current_user;
  v_operator   text := nullif(current_setting('app.admin_actor', true), '');
  v_detail     jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_jwt_role <> 'service_role'
     and v_db_role not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  -- Who actually did it.
  --
  -- actor_id can only be filled from a session that has one, which a direct
  -- connection does not — every Retool action would otherwise be recorded as
  -- an anonymous system event, and "who changed this" is half the point of
  -- the table. So the console names its operator per query:
  --
  --   select set_config('app.admin_actor', '{{ current_user.email }}', true);
  --
  -- Local to the transaction, so it cannot leak between pooled queries. It
  -- is self-declared and therefore not proof of anything on its own — but it
  -- is recorded alongside the database role that was actually used, which is.
  v_detail := v_detail || jsonb_build_object(
    'db_role', v_db_role,
    'jwt_role', nullif(v_jwt_role, '')
  );
  if v_operator is not null then
    v_detail := v_detail || jsonb_build_object('operator', v_operator);
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, v_detail);
end; $$;
