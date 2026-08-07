-- ===========================================================================
-- mark_activity_read() hands back the timestamp it replaced.
--
-- The Activity tab marks everything read the moment it opens, which is right
-- — opening the tab is what "seen" means. But it meant nothing could ever be
-- shown as unread: by the time the rows rendered, the watermark had already
-- moved past them.
--
-- Returning the previous value fixes that in one call. The screen keeps it,
-- renders anything newer as unread on this visit, and the next visit starts
-- from the new watermark. No extra round trip, and no window in which another
-- device could move the watermark between a read and a write.
-- ===========================================================================

-- Dropped rather than replaced: Postgres refuses to change an existing
-- function's return type, and this one went from void to timestamptz.
drop function if exists public.mark_activity_read();

create function public.mark_activity_read()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_previous timestamptz;
begin
  if auth.uid() is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;

  select p.activity_read_at into v_previous from profiles p where p.id = auth.uid();
  update profiles set activity_read_at = now() where id = auth.uid();
  return v_previous;
end; $$;

revoke all on function public.mark_activity_read() from public, anon;
grant execute on function public.mark_activity_read() to authenticated, service_role;
