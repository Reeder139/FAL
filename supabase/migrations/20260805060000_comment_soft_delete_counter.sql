-- ===========================================================================
-- Comments: keep posts.comment_count honest, and stop an author reassigning
-- a comment.
--
-- The table, its RLS and the counter trigger all predate this. Two gaps
-- surfaced when building the UI.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Soft deletes did not decrement the counter.
--
-- comments_counter fires `after insert or delete`, but comments are removed
-- by setting deleted_at, not by DELETE — the select policy is
-- `using (deleted_at is null)`, so the row stays and simply stops being
-- visible. A deleted comment therefore kept its place in the count, and a
-- post could advertise "3 comments" with two under it.
--
-- Separate function rather than extending bump_post_counters(), which is
-- shared with likes and knows nothing about soft deletion.
-- ---------------------------------------------------------------------------
create or replace function private.adjust_comment_count_on_soft_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return null;
end; $$;

create trigger comments_soft_delete_counter
  after update of deleted_at on comments
  for each row execute function private.adjust_comment_count_on_soft_delete();

-- ---------------------------------------------------------------------------
-- 2. "users edit own comments" had a USING clause and no WITH CHECK, the
-- same shape as the posts policy fixed in 20260805050000. USING decides
-- which rows you may update; WITH CHECK decides what they may become. Without
-- it an author could hand a comment to someone else by rewriting author_id,
-- or move it onto another post.
-- ---------------------------------------------------------------------------
alter policy "users edit own comments" on comments
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
