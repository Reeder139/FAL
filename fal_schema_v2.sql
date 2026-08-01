-- ============================================================================
-- FANTASY ANGLING LEAGUES — CORE SCHEMA v2
-- Postgres / Supabase. Run once, on a fresh project.
--
-- Changes from v1:
--   * RLS enabled on EVERY table, with policies for each
--   * Integrity views moved to a private schema (never exposed to the API)
--   * fal_points() rewritten with explicit arguments (v1's composite call was
--     fragile), plus a convenience overload for quick testing
--   * feed_items view added
--   * like/comment counter triggers added (v1 declared the columns but never
--     kept them updated)
--
-- Two layers, deliberately separated:
--   POSTS   = the Instagram part. Every feed item is a post.
--   CATCHES = the game part. A 1:1 optional extension of a post.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists citext;

-- Not exposed via the Data API. Anything in here is invisible to the app.
create schema if not exists private;


-- ============================================================================
-- 1. PEOPLE
-- ============================================================================

create table profiles (
  id                  uuid primary key references auth.users on delete cascade,
  username            citext unique not null,
  display_name        text not null,
  avatar_path         text,              -- STORAGE PATH, never a full URL
  bio                 text,
  postcode_district   text,              -- "NG7" only. Never the full postcode.

  declared_pb_oz      integer,
  pb_evidence_path    text,
  pb_verified         boolean not null default false,

  identity_verified   boolean not null default false,
  is_admin            boolean not null default false,
  suspended_at        timestamptz,
  created_at          timestamptz not null default now()
);

comment on column profiles.pb_verified is
  'Anti-sandbagging: unverified PBs seed into Division 1. Proving a LOW pb is what buys an easier division.';

-- Helper used by policies. security definer so it can read profiles without
-- tripping the profiles policies and causing infinite recursion.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;


-- ============================================================================
-- 2. VENUES
-- Anglers create these as they submit. Expect duplicates. Merge, never delete.
-- Venues are NOT used for scoring — only for plausibility flagging.
-- ============================================================================

create table venues (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  county        text,
  water_type    text check (water_type in ('syndicate','day_ticket','club','private')),
  created_by    uuid references profiles(id),
  merged_into   uuid references venues(id),
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ============================================================================
-- 3. THE FEED (Instagram layer)
-- ============================================================================

create table posts (
  id            uuid primary key default uuid_generate_v4(),
  author_id     uuid not null references profiles(id) on delete cascade,
  kind          text not null default 'catch'
                  check (kind in ('catch','photo','video','announcement')),
  caption       text,
  visibility    text not null default 'public'
                  check (visibility in ('public','followers','league_only','hidden')),
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index on posts (created_at desc);
create index on posts (author_id, created_at desc);

create table post_media (
  id              uuid primary key default uuid_generate_v4(),
  post_id         uuid not null references posts(id) on delete cascade,
  storage_path    text not null,
  media_kind      text not null default 'fish'
                    check (media_kind in ('fish','scales','mat','angler','other')),
  captured_in_app boolean not null default false,
  capture_token   text,
  exif_taken_at   timestamptz,
  width           integer,
  height          integer,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

comment on column post_media.captured_in_app is
  'The single most important anti-fraud field. Tier 2+ evidence requires true.';

create index on post_media (post_id, sort_order);

create table likes (
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table comments (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references posts(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  parent_id   uuid references comments(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index on comments (post_id, created_at);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);


-- ============================================================================
-- 4. CATCHES (game layer)
--
-- THE CRITICAL DECISION: weight_oz is an INTEGER. Never a float, never pounds.
--   32 lb 4 oz  ->  516
-- Exact arithmetic, and terminal-digit fraud analysis is just (weight_oz % 16).
-- Honest weights spread 0-15. Invented ones cluster on 0 and 8.
-- ============================================================================

create table catches (
  id              uuid primary key default uuid_generate_v4(),
  post_id         uuid unique not null references posts(id) on delete cascade,
  angler_id       uuid not null references profiles(id) on delete cascade,

  weight_oz       integer not null check (weight_oz > 0),
  species         text not null default 'carp',
  fish_name       text,
  caught_at       timestamptz not null,
  venue_id        uuid references venues(id),
  venue_hidden    boolean not null default false,

  evidence_tier   smallint not null default 1 check (evidence_tier between 1 and 3),
  status          text not null default 'pending'
                    check (status in ('pending','verified','under_review','rejected')),
  is_pb           boolean not null default false,

  created_at      timestamptz not null default now()
);

create index on catches (angler_id, weight_oz desc);
create index on catches (venue_id, weight_oz);
create index on catches (caught_at);
create index on catches (status);


-- ============================================================================
-- 5. COMPETITION STRUCTURE
-- ============================================================================

create table seasons (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  starts_on             date not null,
  ends_on               date not null,
  counting_fish         smallint not null,          -- 5 summer, 3 winter

  -- SCORING LIVES HERE, NOT IN CODE.
  -- Points are computed and never stored, so changing these numbers re-scores
  -- every leaderboard instantly. That is the beta loop. Do not hardcode.
  scoring_multiplier    numeric not null default 2.0,
  scoring_offset_oz     integer not null default 240,   -- 15 lb
  scoring_exponent      numeric not null default 0.90,
  min_qualifying_oz     integer not null default 240,

  pb_bonus_multiplier   numeric not null default 1.05,
  named_fish_multiplier numeric not null default 1.05,

  status                text not null default 'draft'
                          check (status in ('draft','open','running','closed')),
  created_at            timestamptz not null default now()
);

create table divisions (
  id          uuid primary key default uuid_generate_v4(),
  season_id   uuid not null references seasons(id) on delete cascade,
  name        text not null,
  rank        smallint not null,      -- 1 = hardest
  min_pb_oz   integer,
  max_pb_oz   integer,
  unique (season_id, rank)
);

create table season_entries (
  id            uuid primary key default uuid_generate_v4(),
  season_id     uuid not null references seasons(id) on delete cascade,
  angler_id     uuid not null references profiles(id) on delete cascade,
  division_id   uuid not null references divisions(id),
  tier          text not null default 'open'
                  check (tier in ('open','competitor')),
  joined_at     timestamptz not null default now(),
  unique (season_id, angler_id)
);

create table mini_leagues (
  id          uuid primary key default uuid_generate_v4(),
  season_id   uuid not null references seasons(id) on delete cascade,
  name        text not null,
  owner_id    uuid not null references profiles(id),
  join_code   text unique not null,
  created_at  timestamptz not null default now()
);

create table mini_league_members (
  mini_league_id uuid not null references mini_leagues(id) on delete cascade,
  angler_id      uuid not null references profiles(id) on delete cascade,
  joined_at      timestamptz not null default now(),
  primary key (mini_league_id, angler_id)
);


-- ============================================================================
-- 6. INTEGRITY TABLES — append-only
--
-- Never change a catch's status without writing a catch_reviews row. The day
-- someone loses £20,000 by one fish, this table is the only thing standing
-- between you and an unanswerable accusation.
-- ============================================================================

create table catch_reviews (
  id          uuid primary key default uuid_generate_v4(),
  catch_id    uuid not null references catches(id) on delete cascade,
  reviewer_id uuid references profiles(id),
  from_status text,
  to_status   text not null,
  reason      text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on catch_reviews (catch_id, created_at);

create table flags (
  id           uuid primary key default uuid_generate_v4(),
  catch_id     uuid not null references catches(id) on delete cascade,
  reporter_id  uuid references profiles(id),
  reason       text not null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);


-- ============================================================================
-- 7. SCORING — computed, never stored
-- ============================================================================

create or replace function fal_points(
  p_weight_oz   integer,
  p_multiplier  numeric,
  p_offset_oz   integer,
  p_exponent    numeric,
  p_min_qual_oz integer
) returns numeric
language sql immutable as $$
  select case
    when p_weight_oz < p_min_qual_oz then 0
    else round(
      p_multiplier * power((p_weight_oz - p_offset_oz) / 16.0, p_exponent)
    , 2)
  end;
$$;

-- Convenience overload for testing: fal_points(516, s.*) from seasons s
create or replace function fal_points(p_weight_oz integer, p_season seasons)
returns numeric
language sql immutable as $$
  select fal_points(
    p_weight_oz,
    p_season.scoring_multiplier,
    p_season.scoring_offset_oz,
    p_season.scoring_exponent,
    p_season.min_qualifying_oz
  );
$$;


-- ============================================================================
-- 8. VIEWS
-- security_invoker = on makes views respect the caller's RLS rather than
-- running as their creator. Without this, a view is a hole straight through
-- every policy below.
-- ============================================================================

create or replace view feed_items
with (security_invoker = on) as
select
  p.id            as post_id,
  p.author_id,
  pr.username,
  pr.display_name,
  pr.avatar_path,
  p.kind,
  p.caption,
  p.like_count,
  p.comment_count,
  p.created_at,
  c.id            as catch_id,
  c.weight_oz,
  c.species,
  c.fish_name,
  c.status        as catch_status,
  case when c.venue_hidden then null else v.name end as venue_name
from posts p
join profiles pr on pr.id = p.author_id
left join catches c on c.post_id = p.id
left join venues v  on v.id = c.venue_id
where p.deleted_at is null;

-- Every counting fish, ranked within its angler's season.
create or replace view scored_catches
with (security_invoker = on) as
select
  c.id            as catch_id,
  c.angler_id,
  se.season_id,
  se.division_id,
  se.tier,
  c.weight_oz,
  c.caught_at,
  fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
             s.scoring_exponent, s.min_qualifying_oz)
    * case when c.is_pb then s.pb_bonus_multiplier else 1 end
    * case when c.fish_name is not null then s.named_fish_multiplier else 1 end
                  as points,
  row_number() over (
    partition by c.angler_id, se.season_id
    order by fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
                        s.scoring_exponent, s.min_qualifying_oz) desc,
             c.caught_at asc
  )               as rank_in_season
from catches c
join season_entries se on se.angler_id = c.angler_id
join seasons s         on s.id = se.season_id
where c.status = 'verified'
  and c.caught_at::date between s.starts_on and s.ends_on;

-- TODO before launch: the "one counting fish per 24 hours" rule filters here,
-- not at submission. Anglers should still be able to POST every fish they catch.

create or replace view league_table
with (security_invoker = on) as
select
  sc.season_id,
  sc.division_id,
  sc.angler_id,
  sum(sc.points)    as total_points,
  count(*)          as counting_fish,
  max(sc.weight_oz) as best_fish_oz,
  rank() over (
    partition by sc.season_id, sc.division_id
    order by sum(sc.points) desc
  )                 as position
from scored_catches sc
join seasons s on s.id = sc.season_id
where sc.rank_in_season <= s.counting_fish
group by sc.season_id, sc.division_id, sc.angler_id, s.counting_fish;


-- ============================================================================
-- 9. PRIVATE INTEGRITY VIEWS
-- These live outside the API. Anglers must never be able to see what trips
-- the fraud checks, or they will optimise around it.
-- ============================================================================

create or replace view private.venue_distributions as
select
  venue_id,
  count(*)                                                as n,
  percentile_cont(0.50) within group (order by weight_oz)  as p50_oz,
  percentile_cont(0.95) within group (order by weight_oz)  as p95_oz,
  max(weight_oz)                                           as max_oz
from public.catches
where status = 'verified' and venue_id is not null
group by venue_id;

-- Terminal-digit analysis. Free, because weight is stored in ounces.
create or replace view private.ounce_digit_profile as
select angler_id,
       count(*)                                     as n,
       count(*) filter (where weight_oz % 16 = 0)   as ends_zero,
       count(*) filter (where weight_oz % 16 = 8)   as ends_eight,
       round(100.0 * count(*) filter (where weight_oz % 16 in (0,8))
             / nullif(count(*),0), 1)               as pct_round_numbers
from public.catches
group by angler_id;


-- ============================================================================
-- 10. COUNTER TRIGGERS
-- security definer because a user liking someone else's post must be able to
-- bump a counter on a row they do not own.
-- ============================================================================

create or replace function bump_post_counters()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      update posts set like_count = like_count + 1 where id = new.post_id;
    else
      update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    end if;
  else
    if tg_op = 'INSERT' then
      update posts set comment_count = comment_count + 1 where id = new.post_id;
    else
      update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
  end if;
  return null;
end; $$;

create trigger likes_counter
  after insert or delete on likes
  for each row execute function bump_post_counters();

create trigger comments_counter
  after insert or delete on comments
  for each row execute function bump_post_counters();


-- ============================================================================
-- 11. ROW LEVEL SECURITY
--
-- Every table. No exceptions.
-- Note: the service_role key bypasses RLS entirely — that is how your admin
-- console and edge functions do their work. Never ship that key to the app.
-- ============================================================================

alter table profiles            enable row level security;
alter table venues              enable row level security;
alter table posts               enable row level security;
alter table post_media          enable row level security;
alter table likes               enable row level security;
alter table comments            enable row level security;
alter table follows             enable row level security;
alter table catches             enable row level security;
alter table seasons             enable row level security;
alter table divisions           enable row level security;
alter table season_entries      enable row level security;
alter table mini_leagues        enable row level security;
alter table mini_league_members enable row level security;
alter table catch_reviews       enable row level security;
alter table flags               enable row level security;

-- --- profiles ---------------------------------------------------------------
create policy "profiles readable by all"
  on profiles for select using (true);
create policy "users create own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "users edit own profile"
  on profiles for update using (auth.uid() = id);

-- --- venues -----------------------------------------------------------------
create policy "venues readable by all"
  on venues for select using (true);
create policy "signed in users add venues"
  on venues for insert with check (auth.uid() = created_by);

-- --- posts ------------------------------------------------------------------
create policy "public posts readable"
  on posts for select using (visibility = 'public' and deleted_at is null);
create policy "authors write own posts"
  on posts for insert with check (auth.uid() = author_id);
create policy "authors edit own posts"
  on posts for update using (auth.uid() = author_id);

-- --- post_media -------------------------------------------------------------
create policy "media readable with post"
  on post_media for select using (
    exists (select 1 from posts p
            where p.id = post_id and p.visibility = 'public' and p.deleted_at is null)
  );
create policy "authors add own media"
  on post_media for insert with check (
    exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- --- likes ------------------------------------------------------------------
create policy "likes readable by all"
  on likes for select using (true);
create policy "users like as themselves"
  on likes for insert with check (auth.uid() = user_id);
create policy "users unlike their own"
  on likes for delete using (auth.uid() = user_id);

-- --- comments ---------------------------------------------------------------
create policy "comments readable by all"
  on comments for select using (deleted_at is null);
create policy "users comment as themselves"
  on comments for insert with check (auth.uid() = author_id);
create policy "users edit own comments"
  on comments for update using (auth.uid() = author_id);

-- --- follows ----------------------------------------------------------------
create policy "follows readable by all"
  on follows for select using (true);
create policy "users follow as themselves"
  on follows for insert with check (auth.uid() = follower_id);
create policy "users unfollow their own"
  on follows for delete using (auth.uid() = follower_id);

-- --- catches ----------------------------------------------------------------
create policy "catches readable by all"
  on catches for select using (true);
create policy "anglers submit own catches"
  on catches for insert with check (auth.uid() = angler_id);
-- Deliberately NO update or delete policy for anglers.
-- Once a weight is submitted it is evidence. Corrections go through review.

-- --- competition structure: read-only to everyone, written by admin only -----
create policy "seasons readable by all"
  on seasons for select using (true);
create policy "divisions readable by all"
  on divisions for select using (true);
create policy "entries readable by all"
  on season_entries for select using (true);
create policy "anglers join seasons as themselves"
  on season_entries for insert with check (auth.uid() = angler_id);

-- --- mini leagues -----------------------------------------------------------
create policy "mini leagues readable by all"
  on mini_leagues for select using (true);
create policy "users create own mini leagues"
  on mini_leagues for insert with check (auth.uid() = owner_id);
create policy "owners edit own mini leagues"
  on mini_leagues for update using (auth.uid() = owner_id);
create policy "membership readable by all"
  on mini_league_members for select using (true);
create policy "users join mini leagues as themselves"
  on mini_league_members for insert with check (auth.uid() = angler_id);
create policy "users leave mini leagues"
  on mini_league_members for delete using (auth.uid() = angler_id);

-- --- integrity --------------------------------------------------------------
create policy "reviews readable by owner and admins"
  on catch_reviews for select using (
    exists (select 1 from catches c where c.id = catch_id and c.angler_id = auth.uid())
    or public.is_admin()
  );
-- No insert policy: reviews are written by the admin console via service_role.

create policy "users report catches"
  on flags for insert with check (auth.uid() = reporter_id);
create policy "flags readable by admins only"
  on flags for select using (public.is_admin());


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
