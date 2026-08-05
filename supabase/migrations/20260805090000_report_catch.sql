-- ===========================================================================
-- Reporting a catch.
--
-- The flags table and its policies already existed: members may insert, only
-- admins may read. What was missing is the shape of a report — who may make
-- one, about what, and how many times.
-- ===========================================================================

-- One open report per person per catch. Without this the loudest reporter
-- sets the queue order: report the same fish five times and it climbs above
-- a catch five different people are worried about, which is precisely
-- backwards. Partial, so a resolved report never blocks a new one about a
-- genuinely new concern.
create unique index if not exists flags_one_open_per_reporter
  on flags (catch_id, reporter_id) where resolved_at is null;

/**
 * Report a catch.
 *
 * security definer because the guards matter more than the insert: the
 * policy on flags checks only that you are writing your own reporter_id,
 * which does not stop you reporting your own fish or filing the same
 * complaint repeatedly.
 *
 * Silent about duplicates on purpose. `on conflict do nothing` means a
 * second report returns success rather than an error — flags are readable
 * only by admins, so the app cannot tell whether a report already exists,
 * and "you have already reported this" would leak that the first one landed
 * on someone who might be probing.
 */
create or replace function public.report_catch(p_catch_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then
    raise exception 'must be signed in to report a catch' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  select c.angler_id into v_owner from catches c where c.id = p_catch_id;
  if v_owner is null then
    raise exception 'catch % not found', p_catch_id using errcode = 'P0002';
  end if;
  if v_owner = v_me then
    raise exception 'you cannot report your own catch' using errcode = '22023';
  end if;

  insert into flags (catch_id, reporter_id, reason)
  values (p_catch_id, v_me, trim(p_reason))
  on conflict (catch_id, reporter_id) where resolved_at is null do nothing;
end; $$;

revoke all on function public.report_catch(uuid, text) from public, anon;
grant execute on function public.report_catch(uuid, text) to authenticated, service_role;

/**
 * Close every open report on a catch.
 *
 * Per catch rather than per flag, because that is the unit a reviewer works
 * in: they look at one fish, decide, and everything filed about it is
 * settled by that decision. Resolving one report at a time would leave a
 * catch sitting in the queue because the fourth person to complain has not
 * been ticked off.
 *
 * Deliberately does not touch the catch's status. Dismissing a report and
 * rejecting a fish are different decisions, and one should not quietly
 * perform the other — call verify_catch, reject_catch or request_evidence
 * alongside this as the review warrants.
 */
create or replace function public.resolve_catch_flags(p_catch_id uuid, p_note text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_closed integer;
begin
  perform private.admin_audit('resolve_catch_flags', 'catches', p_catch_id,
    jsonb_build_object('note', p_note));

  update flags set resolved_at = now()
   where catch_id = p_catch_id and resolved_at is null;
  get diagnostics v_closed = row_count;

  return v_closed;
end; $$;

revoke all on function public.resolve_catch_flags(uuid, text) from public, anon;
grant execute on function public.resolve_catch_flags(uuid, text) to authenticated, service_role;
