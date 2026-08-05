-- ===========================================================================
-- SECURITY FIX — the admin gate was open to any signed-in member.
--
-- 20260805030000 widened private.admin_audit() to accept a direct database
-- connection, so the Retool console could reach both the admin functions and
-- the private review view. It tested current_user against a list of trusted
-- roles. That was wrong, and wrong in the worst direction.
--
-- Inside a SECURITY DEFINER function, current_user is the function's OWNER,
-- not its caller — that is the whole point of SECURITY DEFINER. These
-- functions are owned by postgres, so current_user was always 'postgres',
-- the check always passed, and every admin function became callable by any
-- authenticated angler: suspend a member, verify a catch, retune scoring.
-- Confirmed against the live project before writing this, with an ordinary
-- member account calling suspend_member successfully.
--
-- session_user is the role that actually opened the connection and is not
-- rewritten by SECURITY DEFINER. Through PostgREST that is 'authenticator'
-- for anon and authenticated alike, so an API caller can no longer satisfy
-- the trusted-connection branch at all and has to pass is_admin() like
-- anything else. A direct psql or Retool session still authenticates as
-- postgres and is still accepted.
--
-- Lesson for anything added here later: a gate that widens access must be
-- tested from the outside, as the least privileged caller. This one was
-- tested by confirming the console still worked, which it did, and which
-- proved nothing about who else it now let in.
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
  v_jwt_role  text := coalesce(auth.role(), '');
  -- session_user, NOT current_user. See the header.
  v_conn_role text := session_user;
  v_operator  text := nullif(current_setting('app.admin_actor', true), '');
  v_detail    jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_jwt_role <> 'service_role'
     and v_conn_role not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  v_detail := v_detail || jsonb_build_object(
    'conn_role', v_conn_role,
    'jwt_role', nullif(v_jwt_role, '')
  );
  if v_operator is not null then
    v_detail := v_detail || jsonb_build_object('operator', v_operator);
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, v_detail);
end; $$;
