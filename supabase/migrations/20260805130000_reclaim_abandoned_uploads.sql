-- ===========================================================================
-- Let an angler clear their own abandoned uploads — and only those.
--
-- submitCatch uploads every photo to storage first, because the storage path
-- contains the post id and the id has to exist before the write. Only then
-- does it call submit_catch(). When that RPC raises — a duplicate image, a
-- validation failure, anything — it rolls back, so no post, no catch and no
-- post_media row is created. The uploaded files, however, are already in the
-- bucket, and nothing removed them.
--
-- Found live: four abandoned folders holding eight files on a single account
-- after four rejected submissions, with no row anywhere referencing them.
--
-- The client can now tidy up after itself, but only in the one case where
-- that is safe. A blanket "anglers delete their own folder" policy would be
-- a hole straight through the evidence rules: catches deliberately have no
-- update or delete policy, and posts refuses self-deletion of anything
-- carrying a catch, precisely so a weight cannot be withdrawn once
-- submitted. Letting the angler delete the photograph instead would achieve
-- the same thing by the back door.
--
-- So the policy turns on whether anything references the object. Before
-- submit_catch commits there is no post_media row and the file is rubbish;
-- the moment it commits, the row exists and the file becomes evidence that
-- the angler can no longer touch. Nothing has to remember to enforce that —
-- it follows from the data.
-- ===========================================================================

-- The policy's subquery runs per object on every delete attempt, and
-- storage_path is otherwise unindexed.
create index if not exists post_media_storage_path_idx
  on post_media (storage_path);

create policy "users clear own abandoned uploads"
  on storage.objects for delete
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.post_media pm where pm.storage_path = storage.objects.name
    )
  );
