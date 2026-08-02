-- Fix: submit_catch's `returns table (..., status text)` implicitly declares
-- a plpgsql variable named `status`, which collided with the unqualified
-- `status` column reference in the PB-threshold subquery — Postgres
-- couldn't tell which one was meant. Qualifying with the table alias.

create or replace function public.submit_catch(
  p_caption        text,
  p_weight_oz      integer,
  p_caught_at      timestamptz,
  p_venue_id       uuid,
  p_new_venue_name text,
  p_venue_hidden   boolean,
  p_photos         jsonb,
  p_post_id        uuid
)
returns table (post_id uuid, catch_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_angler_id          uuid := auth.uid();
  v_post_id            uuid := p_post_id;
  v_catch_id           uuid;
  v_venue_id           uuid := p_venue_id;
  v_kind               text;
  v_status             text := 'verified';
  v_flag_reason        text;
  v_photo              jsonb;
  v_hero_count         integer;
  v_pb_threshold       integer;
  v_is_pb              boolean;
  v_evidence_tier      smallint := 1;
  v_min_exif_gap_days  constant numeric := 7;
begin
  if v_angler_id is null then
    raise exception 'Must be signed in to submit a catch.';
  end if;

  if p_photos is null or jsonb_array_length(p_photos) = 0 then
    raise exception 'At least one photo is required.';
  end if;

  select count(*) into v_hero_count
  from jsonb_array_elements(p_photos) p
  where p.value ->> 'media_role' = 'hero';
  if v_hero_count <> 1 then
    raise exception 'Exactly one photo must be marked as hero.';
  end if;

  for v_photo in select * from jsonb_array_elements(p_photos)
  loop
    if v_photo ->> 'perceptual_hash' is not null and exists (
      select 1 from post_media pm where pm.perceptual_hash = v_photo ->> 'perceptual_hash'
    ) then
      raise exception 'DUPLICATE_IMAGE: This photo has already been submitted.';
    end if;
    if (v_photo ->> 'captured_in_app')::boolean is true then
      v_evidence_tier := 2;
    end if;
  end loop;

  if v_venue_id is null and p_new_venue_name is not null and length(trim(p_new_venue_name)) > 0 then
    insert into venues (name, created_by)
    values (trim(p_new_venue_name), v_angler_id)
    returning id into v_venue_id;
  end if;

  v_kind := case when p_weight_oz is not null then 'catch' else 'photo' end;

  insert into posts (id, author_id, kind, caption)
  values (v_post_id, v_angler_id, v_kind, p_caption);

  if v_kind = 'catch' then
    select greatest(
      coalesce((select max(c.weight_oz) from catches c where c.angler_id = v_angler_id and c.status = 'verified'), 0),
      coalesce((select p.declared_pb_oz from profiles p where p.id = v_angler_id), 0)
    ) into v_pb_threshold;
    v_is_pb := p_weight_oz > v_pb_threshold;

    for v_photo in select * from jsonb_array_elements(p_photos)
    loop
      if (v_photo ->> 'exif_taken_at') is null then
        v_flag_reason := coalesce(v_flag_reason, 'Missing EXIF capture timestamp.');
      elsif abs(extract(epoch from ((v_photo ->> 'exif_taken_at')::timestamptz - p_caught_at)))
            > v_min_exif_gap_days * 86400 then
        v_flag_reason := coalesce(v_flag_reason, 'EXIF capture timestamp is more than 7 days from the reported catch time.');
      elsif not public.is_phone_camera_make(v_photo ->> 'exif_camera_make') then
        v_flag_reason := coalesce(v_flag_reason, 'Photo appears to be from a non-phone camera.');
      end if;
    end loop;

    v_status := case when v_flag_reason is not null then 'under_review' else 'verified' end;

    insert into catches (post_id, angler_id, weight_oz, caught_at, venue_id, venue_hidden,
                          is_pb, status, evidence_tier)
    values (v_post_id, v_angler_id, p_weight_oz, p_caught_at, v_venue_id, coalesce(p_venue_hidden, false),
            v_is_pb, v_status, v_evidence_tier)
    returning id into v_catch_id;

    insert into catch_reviews (catch_id, from_status, to_status, reason, is_system)
    values (
      v_catch_id, 'pending', v_status,
      coalesce(v_flag_reason, 'System auto-verified on submission.'),
      true
    );
  end if;

  insert into post_media (post_id, storage_path, media_role, captured_in_app,
                           exif_taken_at, exif_camera_make, exif_camera_model,
                           perceptual_hash, width, height, sort_order)
  select
    v_post_id,
    p.value ->> 'storage_path',
    coalesce(p.value ->> 'media_role', 'gallery'),
    coalesce((p.value ->> 'captured_in_app')::boolean, false),
    (p.value ->> 'exif_taken_at')::timestamptz,
    p.value ->> 'exif_camera_make',
    p.value ->> 'exif_camera_model',
    p.value ->> 'perceptual_hash',
    (p.value ->> 'width')::integer,
    (p.value ->> 'height')::integer,
    p.ord - 1
  from jsonb_array_elements(p_photos) with ordinality as p(value, ord);

  return query select v_post_id, v_catch_id, v_status;
end;
$$;
