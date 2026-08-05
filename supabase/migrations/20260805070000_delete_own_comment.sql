-- ===========================================================================
-- Deleting your own comment.
--
-- Doing it as a plain UPDATE from the client does not work. With the author's
-- own session, `update comments set body = ...` succeeds and
-- `update comments set deleted_at = now()` on the same row fails with "new
-- row violates row-level security policy" — so the UPDATE policy's check on
-- author_id is satisfied either way, and it is specifically the column that
-- is refused.
--
-- The cause is the interaction between the soft delete and
-- `comments readable by all`, which is `for select using (deleted_at is
-- null)`: the updated row is one the author may no longer read, and the
-- write is rejected on the way out rather than on the way in. I have not
-- pinned down the exact rule that produces it, so this does not try to
-- outsmart it.
--
-- A security definer function is the honest fix rather than the clever one.
-- It states the rule it enforces — you may delete your own comment and no
-- one else's — in one place, and it does not depend on how a policy and a
-- returning clause happen to interact. Loosening the select policy to let
-- authors see their own deleted comments would also work and is worse: every
-- query that lists comments would then have to remember to filter them out,
-- which is exactly the job the policy was doing.
-- ===========================================================================

create or replace function public.delete_own_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_author_id uuid;
  v_deleted   timestamptz;
begin
  select c.author_id, c.deleted_at into v_author_id, v_deleted
    from comments c where c.id = p_comment_id;

  if v_author_id is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  if v_author_id <> auth.uid() then
    raise exception 'you can only delete your own comments' using errcode = '42501';
  end if;
  if v_deleted is not null then
    return; -- already gone; deleting twice is not an error worth raising
  end if;

  -- posts.comment_count is corrected by the trigger on deleted_at
  -- (20260805060000), so nothing here touches it.
  update comments set deleted_at = now() where id = p_comment_id;
end; $$;

revoke all on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated, service_role;
