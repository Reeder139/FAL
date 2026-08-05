-- ===========================================================================
-- Deleting a post.
--
-- posts.deleted_at already existed and the select policy already honoured it
-- — there was simply no way to set it deliberately, and one way to set it by
-- accident. This adds the admin path and closes the accidental one.
--
-- Soft delete throughout. A catch photo is evidence: the row and its media
-- stay, the post stops being visible. Hard deletion would destroy the thing a
-- later dispute is settled with.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Close the hole first.
--
-- "authors edit own posts" is `for update using (auth.uid() = author_id)`
-- with no WITH CHECK, so an angler could set deleted_at on any of their own
-- posts — including a catch. That is worse than it sounds: scored_catches
-- joins catches, season_entries and seasons, but never posts, so a deleted
-- catch post keeps scoring. An angler could take the photograph out of public
-- view and keep the points, which is precisely backwards.
--
-- Editing a caption or visibility stays allowed. Only self-deleting a post
-- that carries a catch is refused, and it is refused at the policy rather
-- than in app code so it holds for anything talking to the API.
-- ---------------------------------------------------------------------------
alter policy "authors edit own posts" on posts
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (
      deleted_at is null
      or not exists (select 1 from catches c where c.post_id = posts.id)
    )
  );

-- ---------------------------------------------------------------------------
-- The admin path.
--
-- Deleting a post that carries a catch is a standings change, so it goes
-- through the same review mechanism as any other: the catch is rejected via
-- catch_reviews, the trigger applies the status, and it drops out of
-- scored_catches. Setting deleted_at alone would hide the post and leave the
-- points on the board.
-- ---------------------------------------------------------------------------
create or replace function public.delete_post(p_post_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_author_id  uuid;
  v_kind       text;
  v_deleted_at timestamptz;
  v_catch_id   uuid;
  v_status     text;
begin
  select p.author_id, p.kind, p.deleted_at
    into v_author_id, v_kind, v_deleted_at
    from posts p where p.id = p_post_id;
  if v_author_id is null then
    raise exception 'post % not found', p_post_id using errcode = 'P0002';
  end if;
  if v_deleted_at is not null then
    raise exception 'post % is already deleted', p_post_id using errcode = '22023';
  end if;

  select c.id, c.status into v_catch_id, v_status
    from catches c where c.post_id = p_post_id;

  perform private.admin_audit('delete_post', 'posts', p_post_id,
    jsonb_build_object(
      'reason', p_reason,
      'author_id', v_author_id,
      'kind', v_kind,
      'catch_id', v_catch_id,
      'catch_status_before', v_status
    ));

  update posts set deleted_at = now() where id = p_post_id;

  -- Only when it still counts. Re-rejecting an already-rejected catch would
  -- add a review saying nothing happened.
  if v_catch_id is not null and v_status <> 'rejected' then
    insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
    values (v_catch_id, auth.uid(), 'rejected',
            coalesce(nullif(trim(p_reason), ''), 'Post deleted'));
  end if;
end; $$;

revoke all on function public.delete_post(uuid, text) from public, anon;
grant execute on function public.delete_post(uuid, text) to service_role, authenticated;
