-- ===========================================================================
-- Admin layer, part 3 of 3: the review view.
--
-- One row per catch carrying everything needed to judge it, so a reviewer
-- makes a decision from a single query instead of assembling it from eight.
-- That matters beyond convenience: a reviewer who has to go and look up the
-- angler's digit profile separately usually will not, and the signal only
-- works if it is in front of them.
--
-- Lives in `private`, which is not exposed through the Data API. Anglers
-- must never be able to see what trips these checks — a percentile, a hash
-- collision, a rounding tell — because anything visible gets optimised
-- around. Retool reaches it on service_role.
-- ===========================================================================

create or replace view private.catch_review_detail
with (security_invoker = on) as
select
  c.id                as catch_id,
  c.status,
  c.evidence_tier,
  c.weight_oz,
  c.species,
  c.fish_name,
  c.caught_at,
  c.is_pb,
  c.created_at        as submitted_at,
  p.id                as post_id,
  p.caption,

  -- ---- the angler -------------------------------------------------------
  pr.id               as angler_id,
  pr.username,
  pr.display_name,
  pr.declared_pb_oz,
  pr.pb_verified,
  pr.identity_verified,
  pr.suspended_at,
  pr.created_at       as angler_joined_at,

  -- This claim against what the angler says their best ever is. A first
  -- fish that beats a declared PB by a wide margin is the ordinary shape of
  -- both a genuine career-best and an invented weight, which is exactly why
  -- it belongs next to everything else rather than on its own.
  c.weight_oz - coalesce(pr.declared_pb_oz, 0) as oz_over_declared_pb,

  -- ---- the venue --------------------------------------------------------
  v.id                as venue_id,
  v.name              as venue_name,
  v.approved          as venue_approved,
  vd.n                as venue_verified_catches,
  vd.p50_oz           as venue_p50_oz,
  vd.p95_oz           as venue_p95_oz,
  vd.max_oz           as venue_max_oz,
  -- Where this claim sits in the venue's own history. Percentile rather
  -- than a flat threshold because a 40lb fish means something different on
  -- each water, and the venue is the only thing that knows which.
  case
    when vd.n is null or vd.n = 0 then null
    else round(100.0 * (
      select count(*) from public.catches oc
       where oc.venue_id = c.venue_id
         and oc.status = 'verified'
         and oc.id <> c.id
         and oc.weight_oz <= c.weight_oz
    ) / vd.n, 1)
  end                 as venue_percentile,

  -- ---- terminal-digit profile ------------------------------------------
  -- Honest weights spread 0-15 across weight_oz % 16. Invented ones cluster
  -- on 0 and 8, because people making numbers up round to the pound or the
  -- half. Meaningless on a handful of fish, which is why n travels with it.
  odp.n                 as angler_catch_count,
  odp.ends_zero,
  odp.ends_eight,
  odp.pct_round_numbers,
  c.weight_oz % 16      as this_catch_ounce_digit,

  -- ---- media, including evidence-only ----------------------------------
  -- The whole set, not the feed subset: evidence photos are the ones taken
  -- for exactly this purpose and are invisible everywhere else.
  (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id,
             'storage_path', m.storage_path,
             'media_kind', m.media_kind,
             'media_role', m.media_role,
             'captured_in_app', m.captured_in_app,
             'exif_taken_at', m.exif_taken_at,
             'exif_camera_make', m.exif_camera_make,
             'exif_camera_model', m.exif_camera_model,
             'exif_raw', m.exif_raw,
             'perceptual_hash', m.perceptual_hash,
             'width', m.width,
             'height', m.height
           ) order by m.media_role, m.sort_order), '[]'::jsonb)
      from public.post_media m where m.post_id = c.post_id
  ) as media,

  -- The single most important field in the whole view: tier 2+ evidence
  -- requires photos taken in-app, and this is whether any actually were.
  (
    select count(*) from public.post_media m
     where m.post_id = c.post_id and m.captured_in_app
  ) as in_app_photo_count,

  -- ---- perceptual hash matches -----------------------------------------
  -- The same photo submitted twice, by the same angler or a different one.
  -- Exact hash equality only — near-duplicate scoring is a separate job and
  -- a loose match here would cost a reviewer more time than it saved.
  (
    select coalesce(jsonb_agg(distinct jsonb_build_object(
             'catch_id', oc.id,
             'angler_id', oc.angler_id,
             'username', opr.username,
             'weight_oz', oc.weight_oz,
             'caught_at', oc.caught_at,
             'status', oc.status,
             'perceptual_hash', om.perceptual_hash
           )), '[]'::jsonb)
      from public.post_media om
      join public.post_media mine
        on mine.post_id = c.post_id
       and mine.perceptual_hash is not null
       and om.perceptual_hash = mine.perceptual_hash
      join public.posts op   on op.id = om.post_id
      join public.catches oc on oc.post_id = op.id and oc.id <> c.id
      join public.profiles opr on opr.id = oc.angler_id
  ) as hash_matches,

  -- ---- the angler's history --------------------------------------------
  (
    select coalesce(jsonb_agg(jsonb_build_object(
             'catch_id', hc.id,
             'weight_oz', hc.weight_oz,
             'caught_at', hc.caught_at,
             'status', hc.status,
             'evidence_tier', hc.evidence_tier,
             'venue_id', hc.venue_id
           ) order by hc.caught_at desc), '[]'::jsonb)
      from public.catches hc where hc.angler_id = c.angler_id
  ) as angler_history,

  -- ---- review trail and flags ------------------------------------------
  (
    select coalesce(jsonb_agg(jsonb_build_object(
             'from_status', r.from_status,
             'to_status', r.to_status,
             'reason', r.reason,
             'reviewer_id', r.reviewer_id,
             'is_system', r.is_system,
             'created_at', r.created_at
           ) order by r.created_at), '[]'::jsonb)
      from public.catch_reviews r where r.catch_id = c.id
  ) as review_history,

  (
    select coalesce(jsonb_agg(jsonb_build_object(
             'flag_id', f.id,
             'reporter_id', f.reporter_id,
             'reason', f.reason,
             'resolved_at', f.resolved_at,
             'created_at', f.created_at
           ) order by f.created_at desc), '[]'::jsonb)
      from public.flags f where f.catch_id = c.id
  ) as flags,

  (
    select count(*) from public.flags f
     where f.catch_id = c.id and f.resolved_at is null
  ) as open_flag_count

from public.catches c
join public.posts p       on p.id = c.post_id
join public.profiles pr   on pr.id = c.angler_id
left join public.venues v on v.id = c.venue_id
left join private.venue_distributions vd on vd.venue_id = c.venue_id
left join private.ounce_digit_profile odp on odp.angler_id = c.angler_id;
