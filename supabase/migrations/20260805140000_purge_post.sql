-- ===========================================================================
-- purge_post: remove an upload and everything belonging to it, permanently.
--
-- This is the deliberate counterpart to delete_post, not a replacement for
-- it. The two answer different questions and both are needed:
--
--   delete_post  hides the post and rejects the catch. The rows stay. The
--                photograph stays. A disputed prize can still be settled
--                years later, because nothing was destroyed.
--
--   purge_post   the upload should never have existed — a test, a mistaken
--                double post, a photo uploaded to the wrong account, or a
--                member exercising a deletion request. Everything goes.
--
-- Defaulting to purge would be wrong: a catch photo is the evidence behind a
-- weight, and the ordinary case for removing a fish is that it was rejected,
-- which is exactly when the evidence matters most. Defaulting to soft delete
-- alone was also wrong, which is why this exists — it left every deleted
-- post's perceptual hash in post_media forever, and the duplicate check in
-- submit_catch tests every hash in the table regardless of whether the post
-- still exists. An angler whose post was removed could never re-upload that
-- photograph again. Observed live: three consecutive submissions rejected as
-- duplicates of a catch that had already been deleted.
--
-- So the block is now a consequence of the evidence still existing, which is
-- the honest rule. Soft-delete a post and its photo stays blocked, because
-- the photo is still on file. Purge it and the hash goes with everything
-- else, because there is nothing left to be a duplicate of.
--
-- What survives is the audit. The detail below records what was destroyed —
-- weight, status, paths, counts — so "nothing gets quietly changed" holds
-- even for the one operation that does destroy something.
--
-- Storage is deliberately NOT touched here. Deleting from storage.objects in
-- SQL removes Postgres's record of a file without removing the file itself,
-- which would leak the bytes and hide the evidence of the leak. The function
-- returns the paths instead, and the caller removes them through the Storage
-- API, which deletes both. If that second step is missed the objects show up
-- in private.orphaned_upload_objects below, so the failure is visible rather
-- than silent.
-- ===========================================================================

create or replace function public.purge_post(p_post_id uuid, p_reason text)
returns table (
  post_id          uuid,
  author_id        uuid,
  storage_paths    text[],
  photos_removed   integer,
  comments_removed integer,
  likes_removed    integer,
  reviews_removed  integer,
  flags_removed    integer,
  catch_removed    boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_author_id    uuid;
  v_kind         text;
  v_deleted_at   timestamptz;
  v_catch_id     uuid;
  v_weight_oz    integer;
  v_status       text;
  v_caught_at    timestamptz;
  v_paths        text[];
  v_photos       integer := 0;
  v_comments     integer := 0;
  v_likes        integer := 0;
  v_reviews      integer := 0;
  v_flags        integer := 0;
begin
  select p.author_id, p.kind, p.deleted_at
    into v_author_id, v_kind, v_deleted_at
    from posts p where p.id = p_post_id;
  if v_author_id is null then
    raise exception 'post % not found', p_post_id using errcode = 'P0002';
  end if;

  select c.id, c.weight_oz, c.status, c.caught_at
    into v_catch_id, v_weight_oz, v_status, v_caught_at
    from catches c where c.post_id = p_post_id;

  -- Captured before anything is deleted: after the post_media rows go there
  -- is no record of where the files were.
  select coalesce(array_agg(pm.storage_path order by pm.storage_path), '{}')
    into v_paths
    from post_media pm where pm.post_id = p_post_id;

  -- Gate and audit in one call, before the destruction rather than after, so
  -- a failure partway through still leaves the intent on record.
  perform private.admin_audit('purge_post', 'posts', p_post_id,
    jsonb_build_object(
      'reason', p_reason,
      'author_id', v_author_id,
      'kind', v_kind,
      'was_soft_deleted', v_deleted_at is not null,
      'catch_id', v_catch_id,
      'catch_weight_oz', v_weight_oz,
      'catch_status', v_status,
      'catch_caught_at', v_caught_at,
      'storage_paths', to_jsonb(v_paths)
    ));

  delete from comments where comments.post_id = p_post_id;
  get diagnostics v_comments = row_count;

  delete from likes where likes.post_id = p_post_id;
  get diagnostics v_likes = row_count;

  if v_catch_id is not null then
    delete from flags where flags.catch_id = v_catch_id;
    get diagnostics v_flags = row_count;

    delete from catch_reviews where catch_reviews.catch_id = v_catch_id;
    get diagnostics v_reviews = row_count;

    delete from catches where catches.id = v_catch_id;
  end if;

  delete from post_media where post_media.post_id = p_post_id;
  get diagnostics v_photos = row_count;

  delete from posts where posts.id = p_post_id;

  return query select
    p_post_id, v_author_id, v_paths,
    v_photos, v_comments, v_likes, v_reviews, v_flags,
    v_catch_id is not null;
end; $$;

revoke all on function public.purge_post(uuid, text) from public, anon;
grant execute on function public.purge_post(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Abandoned uploads: files in the bucket that nothing references.
--
-- Two ways in. A submission that failed after its photos were uploaded (the
-- app now clears these itself, but anything leaked before that shipped is
-- still sitting there), and a purge whose Storage API step did not run.
--
-- In `private` because it exposes the raw storage layout, and because
-- listing what is unreferenced is halfway to listing what is unwatched.
-- ---------------------------------------------------------------------------
create or replace view private.orphaned_upload_objects
with (security_invoker = on) as
select
  o.name                              as storage_path,
  (storage.foldername(o.name))[1]::uuid as author_id,
  o.created_at,
  (o.metadata ->> 'size')::bigint     as size_bytes
from storage.objects o
where o.bucket_id = 'post-media'
  -- Avatars live at the top level of the folder; catch photos are one deeper.
  and array_length(storage.foldername(o.name), 1) > 1
  and not exists (
    select 1 from public.post_media pm where pm.storage_path = o.name
  );

comment on view private.orphaned_upload_objects is
  'Files in post-media that no post_media row references. Safe to delete via the Storage API.';
