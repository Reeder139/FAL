-- ============================================================================
-- Log a Catch: media_role, evidence visibility, and the submit_catch RPC.
--
-- Note: "image_hash ... with an index" is already satisfied by
-- post_media.perceptual_hash (added in 20260802010000, with its own partial
-- index) — skipped rather than adding a duplicate column.
-- ============================================================================

alter table post_media add column media_role text not null default 'gallery'
  check (media_role in ('hero','gallery','evidence'));

-- Evidence shots (e.g. a scales close-up the angler doesn't want in the
-- feed) are visible only to the post's author and admins. Also fixes an
-- existing gap in passing: the old policy didn't let an author see their
-- own media on a non-public post at all.
drop policy "media readable with post" on post_media;

create policy "media readable with post"
  on post_media for select using (
    exists (
      select 1 from posts p
      where p.id = post_id
        and p.deleted_at is null
        and (
          p.author_id = auth.uid()
          or public.is_admin()
          or (p.visibility = 'public' and media_role <> 'evidence')
        )
    )
  );


-- ============================================================================
-- The old per-photo trigger (20260802010000) is superseded by submit_catch
-- below, which does the same evidence evaluation inline, atomically, with
-- the new rules (7 days not 48h, camera-type check, collision blocks
-- *before* insert instead of rejecting after). Running both would double up
-- catch_reviews rows and apply the old 48h threshold on top of the new one.
-- ============================================================================

drop trigger post_media_evaluate_evidence on post_media;
drop function evaluate_catch_evidence();


-- Heuristic, not a guarantee — deliberately only ever used to *flag for
-- review*, never to block, so a wrong guess costs an admin a look, not an
-- angler their submission. Unknown/missing make is treated as "assume
-- phone": the separate missing-EXIF check already covers the more serious
-- case of no data at all.
create or replace function public.is_phone_camera_make(p_make text)
returns boolean
language sql immutable as $$
  select p_make is null or lower(p_make) ~
    '(apple|samsung|google|oneplus|xiaomi|huawei|oppo|vivo|motorola|nokia|asus|honor|realme|lg electronics|zte|sony ericsson)';
$$;


-- Creates a post (+ catches row, if a weight was given) and its photos in
-- one transaction, so a failure partway through leaves nothing behind.
--
-- Every catch is inserted identically — this function never decides
-- whether it "counts" toward the league; league_table does that later,
-- purely from season_entries + counting_fish. What this function *does*
-- decide is evidence trust: status defaults to 'verified' (auto-verify),
-- downgrading to 'under_review' — never 'rejected' — if EXIF is missing,
-- the EXIF timestamp is more than 7 days from the reported caught_at, or
-- the photo looks like it came from a non-phone camera. A perceptual-hash
-- collision is the one thing that blocks outright, and it's checked before
-- any row is written, so a rejected submission never touches the database.
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

  -- Perceptual-hash collision check FIRST — before anything is written, so
  -- a duplicate submission leaves no trace at all.
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
      coalesce((select max(weight_oz) from catches where angler_id = v_angler_id and status = 'verified'), 0),
      coalesce((select declared_pb_oz from profiles where id = v_angler_id), 0)
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


-- For anglers with no season_entries row ("free members" — scored_catches
-- inner-joins season_entries, so they never appear in it). Mirrors the real
-- scoring/ranking logic as closely as possible without requiring one, so
-- the join-prompt preview is an honest estimate rather than a guess:
-- division comes from where declared_pb_oz falls in the season's division
-- ranges, and hypothetical_season_total applies the same "top counting_fish
-- catches" cap league_table uses. Percentile is null under 20 division
-- members — below that, percentages are noise, not signal.
create or replace function public.hypothetical_catch_preview(p_catch_id uuid)
returns table (
  points                     numeric,
  hypothetical_season_total  numeric,
  division_id                uuid,
  division_name              text,
  division_member_count      integer,
  percentile                 numeric
)
language plpgsql stable as $$
declare
  v_catch   catches%rowtype;
  v_profile profiles%rowtype;
  v_season  seasons%rowtype;
  v_division divisions%rowtype;
begin
  select * into v_catch from catches where id = p_catch_id;
  select * into v_profile from profiles where id = v_catch.angler_id;

  select * into v_season from seasons s
    where v_catch.caught_at::date between s.starts_on and s.ends_on
      and s.status in ('open', 'running')
    order by s.starts_on desc
    limit 1;

  if v_season.id is null then
    return;
  end if;

  points := fal_points(v_catch.weight_oz, v_season.scoring_multiplier, v_season.scoring_offset_oz,
                        v_season.scoring_exponent, v_season.min_qualifying_oz)
            * case when v_catch.is_pb then v_season.pb_bonus_multiplier else 1 end
            * case when v_catch.fish_name is not null then v_season.named_fish_multiplier else 1 end;

  select * into v_division from divisions d
    where d.season_id = v_season.id
      and (d.min_pb_oz is null or coalesce(v_profile.declared_pb_oz, 0) >= d.min_pb_oz)
      and (d.max_pb_oz is null or coalesce(v_profile.declared_pb_oz, 0) <= d.max_pb_oz)
    limit 1;

  division_id := v_division.id;
  division_name := v_division.name;

  with angler_catches as (
    select c.weight_oz, c.is_pb, c.fish_name
    from catches c
    where c.angler_id = v_catch.angler_id
      and c.status = 'verified'
      and c.caught_at::date between v_season.starts_on and v_season.ends_on
  ),
  scored as (
    select
      fal_points(weight_oz, v_season.scoring_multiplier, v_season.scoring_offset_oz,
                 v_season.scoring_exponent, v_season.min_qualifying_oz)
        * case when is_pb then v_season.pb_bonus_multiplier else 1 end
        * case when fish_name is not null then v_season.named_fish_multiplier else 1 end as pts
    from angler_catches
    order by pts desc
    limit v_season.counting_fish
  )
  select coalesce(sum(pts), 0) into hypothetical_season_total from scored;

  select count(*) into division_member_count
  from season_entries se
  where se.season_id = v_season.id and se.division_id = v_division.id;

  if division_member_count >= 20 then
    select 100.0 * count(*) filter (where lt.total_points < hypothetical_season_total) / count(*)
      into percentile
    from league_table lt
    where lt.season_id = v_season.id and lt.division_id = v_division.id;
  else
    percentile := null;
  end if;

  return next;
end;
$$;
