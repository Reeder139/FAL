-- ============================================================================
-- 12. STORAGE
--
-- post-media: PUBLIC bucket for post/catch photos. Because it's public,
-- objects are servable via a direct public URL that bypasses these RLS
-- policies entirely for normal reads — the select policy below only governs
-- access through the authenticated Storage API, not the public CDN URL.
-- Insert is still meaningfully gated: anglers may only upload into a
-- top-level folder matching their own auth.uid(), e.g. `<uid>/photo.jpg`.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

create policy "post media readable by all"
  on storage.objects for select
  using (bucket_id = 'post-media');

create policy "users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
