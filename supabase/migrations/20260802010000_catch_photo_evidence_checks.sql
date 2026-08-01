-- ============================================================================
-- Catch photo evidence: EXIF + perceptual hash fraud checks.
--
-- Photo input is camera roll upload, not mandatory in-app capture. To
-- compensate, every uploaded photo carries EXIF (extracted client-side
-- *before* any resize/compression, since resizing strips it — see
-- mobile/src/lib/catchPhoto.ts) and a perceptual hash, computed from a
-- fixed-size downscale of the original.
--
-- This can't be enforced client-side: the catches insert policy only checks
-- angler_id ownership, not the value of `status`, so a patched client could
-- just insert status = 'verified' directly. The actual reject/flag decision
-- has to happen server-side, in this trigger, the same way evidence_tier
-- and captured_in_app already gate trust structurally rather than by
-- policy alone.
-- ============================================================================

alter table post_media add column exif_camera_make  text;
alter table post_media add column exif_camera_model text;
alter table post_media add column perceptual_hash   text;

-- Collision lookups scan this on every photo insert — keep it cheap.
create index on post_media (perceptual_hash) where perceptual_hash is not null;


create or replace function evaluate_catch_evidence()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_catch_id  uuid;
  v_caught_at timestamptz;
  v_status    text;
  v_reason    text;
begin
  select c.id, c.caught_at, c.status
    into v_catch_id, v_caught_at, v_status
  from catches c
  where c.post_id = new.post_id;

  -- Not a catch post (e.g. a plain photo/announcement post) — nothing to evaluate.
  if v_catch_id is null then
    return new;
  end if;

  -- Rejected is terminal — a later photo can't un-reject a catch.
  if v_status = 'rejected' then
    return new;
  end if;

  -- Exact perceptual-hash collision: hard reject, same image already submitted.
  if new.perceptual_hash is not null and exists (
    select 1 from post_media pm
    where pm.perceptual_hash = new.perceptual_hash
      and pm.id <> new.id
  ) then
    update catches set status = 'rejected' where id = v_catch_id;
    insert into catch_reviews (catch_id, from_status, to_status, reason, is_system)
    values (v_catch_id, v_status, 'rejected',
            'Duplicate image: perceptual hash matches an existing submission.', true);
    return new;
  end if;

  -- Already flagged by an earlier photo on this catch — leave it for an admin,
  -- don't write a second review row for the same underlying issue.
  if v_status = 'under_review' then
    return new;
  end if;

  if new.exif_taken_at is null then
    v_reason := 'Missing EXIF capture timestamp.';
  elsif abs(extract(epoch from (new.exif_taken_at - v_caught_at))) > 48 * 3600 then
    v_reason := 'EXIF capture timestamp is more than 48 hours from the reported catch time.';
  end if;

  if v_reason is not null then
    update catches set status = 'under_review' where id = v_catch_id;
    insert into catch_reviews (catch_id, from_status, to_status, reason, is_system)
    values (v_catch_id, v_status, 'under_review', v_reason, true);
  end if;

  return new;
end;
$$;

create trigger post_media_evaluate_evidence
  after insert on post_media
  for each row execute function evaluate_catch_evidence();
