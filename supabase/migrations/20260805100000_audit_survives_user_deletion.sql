-- ===========================================================================
-- The audit trail must not stop a user being deleted.
--
-- admin_actions.actor_id references profiles with no on-delete behaviour, so
-- the default applies: deleting a profile that ever performed an admin action
-- fails on the foreign key. And admin_actions is append-only — a trigger
-- refuses UPDATE and DELETE even for service_role — so the reference cannot
-- be cleared or the row removed to get out of the way.
--
-- Together that means anyone who has ever touched the console can never be
-- deleted. That is not a safeguard, it is a deadlock, and it would eventually
-- collide with a real erasure request rather than a test account.
--
-- ON DELETE SET NULL: the record of what happened survives, the pointer to a
-- row that no longer exists does not. Which is the right way round — an audit
-- entry is evidence of an action, and it should outlive the account that
-- performed it.
-- ===========================================================================

alter table admin_actions
  drop constraint if exists admin_actions_actor_id_fkey;

alter table admin_actions
  add constraint admin_actions_actor_id_fkey
  foreign key (actor_id) references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Keep the attribution when the pointer goes.
--
-- SET NULL costs the audit row its actor, and for a row whose detail carries
-- no `operator` (a signed-in admin acting through the app rather than the
-- console) that would leave nothing at all. So the username is copied into
-- the detail at write time, where it is a value rather than a reference and
-- cannot be nulled by a later deletion.
-- ---------------------------------------------------------------------------
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
  -- session_user, NOT current_user: inside SECURITY DEFINER current_user is
  -- the owner, which once made this gate pass for everybody. See
  -- 20260805040000.
  v_conn_role text := session_user;
  v_operator  text := nullif(current_setting('app.admin_actor', true), '');
  v_actor     uuid := auth.uid();
  v_username  text;
  v_detail    jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_jwt_role <> 'service_role'
     and v_conn_role not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if v_actor is not null then
    select p.username into v_username from profiles p where p.id = v_actor;
  end if;

  v_detail := v_detail || jsonb_build_object(
    'conn_role', v_conn_role,
    'jwt_role', nullif(v_jwt_role, '')
  );
  if v_operator is not null then
    v_detail := v_detail || jsonb_build_object('operator', v_operator);
  end if;
  if v_username is not null then
    v_detail := v_detail || jsonb_build_object('actor_username', v_username);
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (v_actor, p_action, p_target_table, p_target_id, v_detail);
end; $$;
