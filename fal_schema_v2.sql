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
-- Trigram matching, behind search_anglers() — see section 11.
create extension if not exists pg_trgm with schema extensions;

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
  created_at          timestamptz not null default now(),

  -- Kept by bump_follow_counters() (see COUNTER TRIGGERS below) — never
  -- written to directly.
  follower_count      integer not null default 0,
  following_count     integer not null default 0
);

comment on column profiles.pb_verified is
  'Anti-sandbagging: unverified PBs seed into Division 1. Proving a LOW pb is what buys an easier division.';

-- Trigram indexes behind search_anglers() (section 11). These serve both the
-- `%` similarity operator and the leading-wildcard ilike patterns that
-- search uses — a btree can do neither.
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin ((username::text) extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- Helper used by policies. security definer so it can read profiles without
-- tripping the profiles policies and causing infinite recursion.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- Creates the matching profiles row the moment a new auth.users row is
-- inserted, reading username/display_name from raw_user_meta_data (set via
-- supabase.auth.signUp's options.data on the client). security definer is
-- required: this runs inside the same transaction as the auth.users insert,
-- outside any authenticated request context, so there's no settled
-- auth.uid() yet for the "users create own profile" RLS policy to check.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


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

-- Case-insensitive index so the picker search and the merge tool's
-- near-duplicate lookups stay fast as the venue list grows from user
-- submissions.
create index venues_name_lower_idx on venues (lower(name));

-- Admin tool for folding duplicate venues together. Repoints every catch at
-- the surviving venue and marks the loser as merged — never deletes a venue
-- row, so catch history stays intact. If the survivor has itself already
-- been merged into another venue, catches are repointed at the end of that
-- chain instead.
create or replace function public.merge_venue(p_loser_id uuid, p_survivor_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_survivor_id uuid := p_survivor_id;
  v_next_id     uuid;
  v_moved       integer;
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required.';
  end if;

  if p_loser_id is null or p_survivor_id is null then
    raise exception 'Both a loser and a survivor venue id are required.';
  end if;

  if not exists (select 1 from venues where id = p_loser_id) then
    raise exception 'Venue % does not exist.', p_loser_id;
  end if;

  -- Resolve the survivor to the end of any existing merge chain.
  loop
    select merged_into into v_next_id from venues where id = v_survivor_id;
    exit when v_next_id is null;
    v_survivor_id := v_next_id;
  end loop;

  if v_survivor_id = p_loser_id then
    raise exception 'Cannot merge a venue into itself.';
  end if;

  update catches
  set venue_id = v_survivor_id
  where venue_id = p_loser_id;
  get diagnostics v_moved = row_count;

  update venues
  set merged_into = v_survivor_id
  where id = p_loser_id;

  return v_moved;
end;
$$;


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
  id                uuid primary key default uuid_generate_v4(),
  post_id           uuid not null references posts(id) on delete cascade,
  storage_path      text not null,
  media_kind        text not null default 'fish'
                      check (media_kind in ('fish','scales','mat','angler','other')),
  captured_in_app   boolean not null default false,
  capture_token     text,
  exif_taken_at     timestamptz,
  exif_camera_make  text,
  exif_camera_model text,
  -- Difference hash of a fixed-size downscale of the original photo, computed
  -- client-side before compression (see mobile/src/lib/perceptualHash.ts).
  -- Used to reject exact-duplicate submissions — see section 13.
  perceptual_hash   text,
  -- The untouched EXIF dict. The three parsed columns above are what queries
  -- filter on; this is everything else — GPS, orientation, lens, software
  -- tags — kept so a reviewer can see what we did not parse when a claim
  -- looks wrong (see private.catch_review_detail).
  exif_raw          jsonb,
  -- hero = the feed image (exactly one per catch), gallery = shown but not
  -- the hero, evidence = kept out of the feed entirely, visible only to the
  -- post author and admins (see the post_media select policy below).
  media_role        text not null default 'gallery'
                      check (media_role in ('hero','gallery','evidence')),
  width             integer,
  height            integer,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on column post_media.captured_in_app is
  'The single most important anti-fraud field. Tier 2+ evidence requires true.';

create index on post_media (post_id, sort_order);
create index on post_media (perceptual_hash) where perceptual_hash is not null;

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

create index on follows (follower_id);
create index on follows (followee_id);

-- Lets an angler permanently dismiss a suggested follow from the feed
-- rail rather than seeing them resurface every reload.
create table follow_suggestion_dismissals (
  user_id      uuid not null references profiles(id) on delete cascade,
  suggested_id uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, suggested_id)
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

-- An angler can have several membership periods within one season (e.g.
-- leaves, then rejoins later) — no uniqueness constraint on
-- (season_id, angler_id), left_at marks when a period ended (null = still
-- active). prize_eligible lets a period keep fishing/scoring without
-- counting toward prizes.
create table season_entries (
  id              uuid primary key default uuid_generate_v4(),
  season_id       uuid not null references seasons(id) on delete cascade,
  angler_id       uuid not null references profiles(id) on delete cascade,
  division_id     uuid not null references divisions(id),
  tier            text not null default 'open'
                    check (tier in ('open','competitor')),
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  prize_eligible  boolean not null default true
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
  case when c.venue_hidden then null else v.name end as venue_name,
  p.visibility
from posts p
join profiles pr on pr.id = p.author_id
left join catches c on c.post_id = p.id
left join venues v  on v.id = c.venue_id
where p.deleted_at is null;

-- Feed segments — all three build on feed_items, ordered created_at desc.

-- Posts by people the caller follows, plus their own.
create or replace view feed_following
with (security_invoker = on) as
select fi.*
from feed_items fi
where fi.author_id = auth.uid()
   or fi.author_id in (select f.followee_id from follows f where f.follower_id = auth.uid())
order by fi.created_at desc;

-- All public posts — a global feed, not "everything RLS happens to let
-- this viewer see" (RLS also allows the author, followers-only posts to
-- actual followers, and league_only posts to divisionmates, so it can't be
-- relied on to narrow this to public-only by itself). Needs its own
-- explicit filter, which is why feed_items exposes visibility.
create or replace view feed_all
with (security_invoker = on) as
select fi.*
from feed_items fi
where fi.visibility = 'public'
order by fi.created_at desc;

-- Posts by anglers in the caller's own division, for the season that's
-- currently 'running'. Naturally empty if the caller has no season_entries
-- row in that season — the feed screen hides this tab in that case rather
-- than showing an empty one, but the view itself is safe either way.
create or replace view feed_league
with (security_invoker = on) as
with running_season as (
  select id from seasons where status = 'running' limit 1
), my_division as (
  select se.division_id
  from season_entries se
  join running_season rs on rs.id = se.season_id
  where se.angler_id = auth.uid()
    and se.left_at is null
  limit 1
)
select fi.*
from feed_items fi
join season_entries se on se.angler_id = fi.author_id
join running_season rs on rs.id = se.season_id
join my_division md on md.division_id = se.division_id
where se.left_at is null
order by fi.created_at desc;

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
  and c.caught_at::date between s.starts_on and s.ends_on
  and c.caught_at >= se.joined_at
  and (se.left_at is null or c.caught_at < se.left_at);

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

-- The "National League": one standing across every division in a
-- season. Bragging rights only — no prize money attaches to it, unlike the
-- divisional tables.
--
-- Can't just read league_table: that view's `position` is rank()
-- partitioned by division, i.e. a per-division placing. Ranking nationally
-- means re-ranking over the whole season, so this aggregates from
-- scored_catches the same way and only changes the partition.
--
-- Deliberately NOT filtered by season_entries.tier — it includes everyone
-- with an active entry, which is what the divisional tables already do.
create or replace view national_league_table
with (security_invoker = on) as
select
  sc.season_id,
  sc.angler_id,
  sc.division_id,
  sum(sc.points)    as total_points,
  count(*)          as counting_fish,
  max(sc.weight_oz) as best_fish_oz,
  rank() over (
    partition by sc.season_id
    order by sum(sc.points) desc
  )                 as position
from scored_catches sc
join seasons s on s.id = sc.season_id
where sc.rank_in_season <= s.counting_fish
group by sc.season_id, sc.angler_id, sc.division_id, s.counting_fish;


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

-- security definer because following someone bumps a counter on a profile
-- row the caller does not own.
create or replace function bump_follow_counters()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update profiles set following_count = following_count + 1 where id = new.follower_id;
    update profiles set follower_count  = follower_count + 1  where id = new.followee_id;
  else
    update profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update profiles set follower_count  = greatest(follower_count - 1, 0)  where id = old.followee_id;
  end if;
  return null;
end; $$;

create trigger follows_counter
  after insert or delete on follows
  for each row execute function bump_follow_counters();


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
alter table follow_suggestion_dismissals enable row level security;
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
-- One policy, four ways in: public to everyone, everything to the author,
-- followers-only to actual followers, league_only to divisionmates in the
-- currently running season.
create policy "posts readable by visibility"
  on posts for select using (
    deleted_at is null
    and (
      visibility = 'public'
      or author_id = auth.uid()
      or (
        visibility = 'followers'
        and exists (
          select 1 from follows f
          where f.follower_id = auth.uid()
            and f.followee_id = posts.author_id
        )
      )
      or (
        visibility = 'league_only'
        and exists (
          select 1
          from season_entries se_me
          join season_entries se_author
            on se_author.season_id = se_me.season_id
           and se_author.division_id = se_me.division_id
          join seasons s on s.id = se_me.season_id
          where se_me.angler_id = auth.uid()
            and se_author.angler_id = posts.author_id
            and s.status = 'running'
            and se_me.left_at is null
            and se_author.left_at is null
        )
      )
    )
  );
create policy "authors write own posts"
  on posts for insert with check (auth.uid() = author_id);
create policy "authors edit own posts"
  on posts for update using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (
      -- Captions and visibility stay editable. Self-deleting a post that
      -- carries a catch does not: scored_catches never joins posts, so a
      -- deleted catch post keeps scoring, and an angler could take the
      -- photograph out of public view while keeping the points.
      deleted_at is null
      or not exists (select 1 from catches c where c.post_id = posts.id)
    )
  );

-- --- post_media -------------------------------------------------------------
-- Evidence-role media (e.g. a scales close-up the angler doesn't want in
-- the feed) is visible only to the post's author and admins. Also lets an
-- author see their own media regardless of post visibility, which the
-- previous version of this policy didn't.
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
  on comments for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- --- follows ----------------------------------------------------------------
create policy "follows readable by all"
  on follows for select using (true);
create policy "users follow as themselves"
  on follows for insert with check (auth.uid() = follower_id);
create policy "users unfollow their own"
  on follows for delete using (auth.uid() = follower_id);

-- --- follow suggestion dismissals --------------------------------------------
create policy "users read own dismissals"
  on follow_suggestion_dismissals for select using (auth.uid() = user_id);
create policy "users write own dismissals"
  on follow_suggestion_dismissals for insert with check (auth.uid() = user_id);
create policy "users remove own dismissals"
  on follow_suggestion_dismissals for delete using (auth.uid() = user_id);

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


-- ============================================================================
-- 13. LOG A CATCH: submit_catch RPC
--
-- Photo input is camera roll upload, not mandatory in-app capture. To
-- compensate, every uploaded photo carries EXIF (extracted client-side
-- *before* any resize/compression, since resizing strips it — see
-- mobile/src/lib/catchPhoto.ts) and a perceptual hash.
--
-- This can't be enforced client-side: the catches insert policy only checks
-- angler_id ownership, not the value of `status`, so a patched client could
-- just insert status = 'verified' directly. The reject/flag decision has to
-- happen server-side, in submit_catch below, the same way evidence_tier and
-- captured_in_app already gate trust structurally rather than by policy
-- alone. An earlier version of this did the evaluation in an AFTER INSERT
-- trigger on post_media; that's gone now, replaced by doing it inline in
-- the same transaction as the insert, atomically, with the current rules.
-- ============================================================================

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
  p_post_id        uuid,
  p_visibility     text default 'public'
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

  if p_visibility not in ('public', 'followers', 'league_only', 'hidden') then
    raise exception 'Invalid visibility: %', p_visibility;
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

  insert into posts (id, author_id, kind, caption, visibility)
  values (v_post_id, v_angler_id, v_kind, p_caption, p_visibility);

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


-- ============================================================================
-- 14. LEAGUE SUMMARY: hypothetical position without a season_entries row
--
-- Shared by hypothetical_catch_preview above (keyed off one catch, used by
-- the catch result card) and hypothetical_league_position below (keyed off
-- an angler directly, used by the feed's league summary strip) — both mirror
-- the real scoring/ranking as closely as possible for anglers with no
-- season_entries row, so extracting "which season", "which division for
-- this PB", and "hypothetical top-counting_fish total" once avoids
-- duplicating that logic in two places.
-- ============================================================================

create or replace function public.season_for_date(p_date date)
returns seasons
language sql stable as $$
  select s.* from seasons s
  where p_date between s.starts_on and s.ends_on
    and s.status in ('open', 'running')
  order by s.starts_on desc
  limit 1;
$$;

create or replace function public.division_for_pb(p_season_id uuid, p_declared_pb_oz integer)
returns divisions
language sql stable as $$
  select d.* from divisions d
  where d.season_id = p_season_id
    and (d.min_pb_oz is null or coalesce(p_declared_pb_oz, 0) >= d.min_pb_oz)
    and (d.max_pb_oz is null or coalesce(p_declared_pb_oz, 0) <= d.max_pb_oz)
  limit 1;
$$;

-- Same "top counting_fish scored catches" cap league_table applies, just
-- computed without requiring a season_entries row to join through.
create or replace function public.hypothetical_season_total(p_angler_id uuid, p_season seasons)
returns numeric
language sql stable as $$
  with angler_catches as (
    select c.weight_oz, c.is_pb, c.fish_name
    from catches c
    where c.angler_id = p_angler_id
      and c.status = 'verified'
      and c.caught_at::date between p_season.starts_on and p_season.ends_on
  ),
  scored as (
    select
      fal_points(weight_oz, p_season.scoring_multiplier, p_season.scoring_offset_oz,
                 p_season.scoring_exponent, p_season.min_qualifying_oz)
        * case when is_pb then p_season.pb_bonus_multiplier else 1 end
        * case when fish_name is not null then p_season.named_fish_multiplier else 1 end as pts
    from angler_catches
    order by pts desc
    limit p_season.counting_fish
  )
  select coalesce(sum(pts), 0) from scored;
$$;


-- For anglers with no season_entries row ("free members" — scored_catches
-- inner-joins season_entries, so they never appear in it). Percentile is
-- null under 20 division members — below that, percentages are noise, not
-- signal.
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
  v_catch    catches%rowtype;
  v_profile  profiles%rowtype;
  v_season   seasons%rowtype;
  v_division divisions%rowtype;
begin
  select * into v_catch from catches where id = p_catch_id;
  select * into v_profile from profiles where id = v_catch.angler_id;

  v_season := public.season_for_date(v_catch.caught_at::date);
  if v_season.id is null then
    return;
  end if;

  points := fal_points(v_catch.weight_oz, v_season.scoring_multiplier, v_season.scoring_offset_oz,
                        v_season.scoring_exponent, v_season.min_qualifying_oz)
            * case when v_catch.is_pb then v_season.pb_bonus_multiplier else 1 end
            * case when v_catch.fish_name is not null then v_season.named_fish_multiplier else 1 end;

  v_division := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  division_id := v_division.id;
  division_name := v_division.name;

  hypothetical_season_total := public.hypothetical_season_total(v_catch.angler_id, v_season);

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


-- For the league summary strip on the feed: an angler's *current*
-- hypothetical standing (not tied to one catch). Returns an actual
-- position (not a percentile band, unlike the catch result card) — the
-- client drops it below 20 division members, same threshold, different
-- presentation.
create or replace function public.hypothetical_league_position(p_angler_id uuid)
returns table (
  season_id                 uuid,
  division_id                uuid,
  division_name              text,
  hypothetical_season_total  numeric,
  division_member_count      integer,
  hypothetical_position      integer
)
language plpgsql stable as $$
declare
  v_profile  profiles%rowtype;
  v_season   seasons%rowtype;
  v_division divisions%rowtype;
begin
  select * into v_profile from profiles where id = p_angler_id;

  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  v_division := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  if v_division.id is null then
    return;
  end if;

  season_id := v_season.id;
  division_id := v_division.id;
  division_name := v_division.name;

  hypothetical_season_total := public.hypothetical_season_total(p_angler_id, v_season);

  select count(*) into division_member_count
  from season_entries se
  where se.season_id = v_season.id and se.division_id = v_division.id;

  select 1 + count(*) into hypothetical_position
  from league_table lt
  where lt.season_id = v_season.id
    and lt.division_id = v_division.id
    and lt.total_points > hypothetical_season_total;

  return next;
end;
$$;


-- Backs the feed's suggested-accounts rail. security definer because it
-- reads other anglers' league_table/season_entries/posts rows to build a
-- cross-user recommendation list — same posture as
-- hypothetical_league_position for the same reason.
--
-- Primary mode: top 7 by league_table.position from each division in the
-- currently running season, excluding the caller, anyone already followed,
-- and anyone dismissed (follow_suggestion_dismissals). Ordered caller's own
-- division first, then Division 1, then the rest — "the people you're
-- racing are the most useful follows; Division 1 is the aspirational
-- content."
--
-- Fallback mode (no running season, or any division in it has fewer than 7
-- season_entries members — not enough real standings to fill 7 slots
-- meaningfully): most recent posters the caller doesn't already follow or
-- has dismissed, most recent first.
create or replace function public.suggested_follows()
returns table (
  suggested_id        uuid,
  username             citext,
  display_name         text,
  avatar_path          text,
  division_name        text,
  division_rank        smallint,
  position_in_division integer,
  best_fish_oz         integer
)
language plpgsql security definer set search_path = public as $$
declare
  v_caller         uuid := auth.uid();
  v_season_id      uuid;
  v_my_division    uuid;
  v_div1_id        uuid;
  v_needs_fallback boolean;
begin
  if v_caller is null then
    return;
  end if;

  select id into v_season_id
  from seasons
  where status = 'running'
  limit 1;

  if v_season_id is null then
    v_needs_fallback := true;
  else
    select exists (
      select 1
      from divisions d
      where d.season_id = v_season_id
        and (
          select count(*) from season_entries se
          where se.division_id = d.id and se.left_at is null
        ) < 7
    ) into v_needs_fallback;
  end if;

  if not v_needs_fallback then
    select se.division_id into v_my_division
    from season_entries se
    where se.season_id = v_season_id
      and se.angler_id = v_caller
      and se.left_at is null
    limit 1;

    select id into v_div1_id
    from divisions
    where season_id = v_season_id and rank = 1;

    return query
    with ranked as (
      select
        lt.angler_id,
        lt.division_id,
        lt.position::integer as position,
        lt.best_fish_oz,
        d.name as d_name,
        d.rank as d_rank,
        row_number() over (partition by lt.division_id order by lt.position) as rn
      from league_table lt
      join divisions d on d.id = lt.division_id
      where lt.season_id = v_season_id
        and lt.angler_id <> v_caller
        and not exists (
          select 1 from follows f
          where f.follower_id = v_caller and f.followee_id = lt.angler_id
        )
        and not exists (
          select 1 from follow_suggestion_dismissals fsd
          where fsd.user_id = v_caller and fsd.suggested_id = lt.angler_id
        )
    )
    select
      r.angler_id,
      p.username,
      p.display_name,
      p.avatar_path,
      r.d_name,
      r.d_rank,
      r.position,
      r.best_fish_oz
    from ranked r
    join profiles p on p.id = r.angler_id
    where r.rn <= 7
    order by
      case
        when r.division_id = v_my_division then 0
        when r.division_id = v_div1_id then 1
        else 2
      end,
      r.d_rank,
      r.position
    limit 21;
  else
    return query
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_path,
      null::text,
      null::smallint,
      null::integer,
      null::integer
    from (
      select distinct on (po.author_id) po.author_id, po.created_at
      from posts po
      where po.author_id <> v_caller
        and not exists (
          select 1 from follows f
          where f.follower_id = v_caller and f.followee_id = po.author_id
        )
        and not exists (
          select 1 from follow_suggestion_dismissals fsd
          where fsd.user_id = v_caller and fsd.suggested_id = po.author_id
        )
      order by po.author_id, po.created_at desc
    ) recent
    join profiles p on p.id = recent.author_id
    order by recent.created_at desc
    limit 21;
  end if;
end;
$$;


-- One result set for a league table plus the caller's own "ghost" row, so
-- the position arithmetic happens once, server-side, rather than being
-- re-derived on the client.
--
-- p_division_id null  -> the national table, positions ranked nationally
-- p_division_id set   -> that division's table, positions ranked in-division
--
-- The ghost row is for free members: anglers with no season_entries row in
-- the running season. scored_catches inner-joins season_entries, so they
-- never appear in league_table at all — their score is reconstructed with
-- hypothetical_season_total(), the same function behind the catch result
-- card, so it uses the season's own scoring settings and bonuses.
--
-- Crucially the ghost's position is computed as "one more than the number
-- of real members ahead of it" rather than by re-ranking the combined set.
-- Real members therefore keep their real positions and the ghost slots in
-- between, which is why a ghost and a real row can legitimately show the
-- same number.
--
-- Anglers who do hold a season_entries row (including `open` tier) already
-- appear in league_table normally and get no ghost row.
create or replace function public.league_table_with_ghost(p_division_id uuid default null)
returns table (
  angler_id     uuid,
  username      citext,
  display_name  text,
  avatar_path   text,
  division_id   uuid,
  division_name text,
  division_rank smallint,
  total_points  numeric,
  counting_fish integer,
  best_fish_oz  integer,
  position_in_table integer,
  is_ghost      boolean,
  is_you        boolean
)
language plpgsql stable as $$
declare
  v_caller        uuid := auth.uid();
  v_season        seasons%rowtype;
  v_profile       profiles%rowtype;
  v_ghost_div     divisions%rowtype;
  v_has_entry     boolean := false;
  v_ghost_points  numeric;
  v_ghost_pos     integer;
  v_ghost_best    integer;
  v_ghost_count   integer;
begin
  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return;
  end if;

  -- Division mode. Paid rows are numbered against each other only; unpaid
  -- rows come back with a null position and is_ghost true.
  --
  -- The number is "how many paying anglers are ahead of you, plus one",
  -- counted directly rather than via rank(), because a window function would
  -- have to rank over the unpaid rows too and then have them subtracted back
  -- out. Ties share a number, which is what rank() did before.
  if p_division_id is not null then
    return query
    with member_rows as (
      select
        l.angler_id,
        l.division_id,
        l.total_points,
        l.counting_fish,
        l.best_fish_oz,
        exists (
          select 1
          from season_entries se
          where se.angler_id = l.angler_id
            and se.season_id = l.season_id
            and se.tier = 'competitor'
        ) as is_paid
      from league_table l
      where l.season_id = v_season.id
        and l.division_id = p_division_id
    )
    select
      m.angler_id,
      p.username,
      p.display_name,
      p.avatar_path,
      m.division_id,
      d.name,
      d.rank,
      m.total_points,
      m.counting_fish::integer,
      m.best_fish_oz,
      case
        when m.is_paid then (
          select count(*)::integer + 1
          from member_rows ahead
          where ahead.is_paid
            and ahead.total_points > m.total_points
        )
        else null
      end,
      not m.is_paid,
      m.angler_id = v_caller
    from member_rows m
    join profiles p on p.id = m.angler_id
    join divisions d on d.id = m.division_id;
  else
    -- National mode, unchanged: everyone is in this standing on equal terms.
    return query
    select
      n.angler_id,
      p.username,
      p.display_name,
      p.avatar_path,
      n.division_id,
      d.name,
      d.rank,
      n.total_points,
      n.counting_fish::integer,
      n.best_fish_oz,
      n.position::integer,
      false,
      n.angler_id = v_caller
    from national_league_table n
    join profiles p on p.id = n.angler_id
    join divisions d on d.id = n.division_id
    where n.season_id = v_season.id;
  end if;

  -- Below here: the ghost for anglers with no season_entries row at all.
  -- They never reach league_table, so their score is reconstructed.
  if v_caller is null then
    return;
  end if;

  select * into v_profile from profiles where id = v_caller;
  if v_profile.declared_pb_oz is null then
    return;
  end if;

  select exists (
    select 1 from season_entries se
    where se.season_id = v_season.id
      and se.angler_id = v_caller
      and se.left_at is null
  ) into v_has_entry;
  if v_has_entry then
    return;
  end if;

  v_ghost_div := public.division_for_pb(v_season.id, v_profile.declared_pb_oz);
  if v_ghost_div.id is null then
    return;
  end if;
  -- On a division page, only surface the ghost on the caller's own
  -- division — they aren't racing the others.
  if p_division_id is not null and p_division_id <> v_ghost_div.id then
    return;
  end if;

  v_ghost_points := public.hypothetical_season_total(v_caller, v_season);

  select max(c.weight_oz), least(count(*), v_season.counting_fish)
  into v_ghost_best, v_ghost_count
  from catches c
  where c.angler_id = v_caller
    and c.status = 'verified'
    and c.caught_at::date between v_season.starts_on and v_season.ends_on;

  -- In a division the ghost is unnumbered like any other unpaid row. In the
  -- national table it keeps a real position, since that standing includes
  -- everyone.
  if p_division_id is not null then
    v_ghost_pos := null;
  else
    select count(*)::integer + 1
    into v_ghost_pos
    from national_league_table n
    where n.season_id = v_season.id
      and n.total_points > v_ghost_points;
  end if;

  return query
  select
    v_caller,
    v_profile.username,
    v_profile.display_name,
    v_profile.avatar_path,
    v_ghost_div.id,
    v_ghost_div.name,
    v_ghost_div.rank,
    v_ghost_points,
    coalesce(v_ghost_count, 0),
    v_ghost_best,
    v_ghost_pos,
    true,
    true;
end;
$$;


-- ============================================================================
-- 11. MEMBER SEARCH
-- ============================================================================

-- Ranked member search behind the feed's search dialog.
--
-- Ranked, not merely filtered: results must be "nearest possible" to what
-- was typed, which plain ilike cannot do — '%reder%' misses "reeder139"
-- outright, so one dropped letter returns nothing. This scores every
-- candidate and orders by the score.
--
-- Two mechanisms, taken as the greater of the two, each covering the
-- other's blind spot:
--   * An exact / prefix / substring ladder — someone typing the first three
--     letters of a username expects that person first, and raw trigram
--     similarity ranks a short query against a long name poorly.
--   * Trigram similarity — the only half that absorbs typos.
--
-- Candidates are narrowed by an indexable predicate first (see the trigram
-- indexes on profiles), so this doesn't seq-scan as membership grows.
create or replace function public.search_anglers(p_query text, p_limit integer default 20)
returns table (
  id           uuid,
  username     citext,
  display_name text,
  avatar_path  text,
  is_following boolean,
  match_score  real
)
language sql
stable
-- SECURITY INVOKER (the default, stated because it matters): profiles RLS
-- still applies, so this exposes nothing the client couldn't select itself.
security invoker
set search_path = public, extensions
as $$
  with needle as (
    select
      lower(btrim(p_query)) as q,
      -- LIKE metacharacters escaped: someone typing "100%" searches for
      -- that text rather than globbing every profile.
      replace(replace(replace(btrim(p_query), '\', '\'), '%', '\%'), '_', '\_') as q_like
  ),
  candidates as (
    select p.id, p.username, p.display_name, p.avatar_path, n.q
    from public.profiles p
    cross join needle n
    where n.q <> ''
      and p.id is distinct from auth.uid()
      and (
        p.username::text ilike '%' || n.q_like || '%'
        or coalesce(p.display_name, '') ilike '%' || n.q_like || '%'
        or p.username::text % n.q
        or coalesce(p.display_name, '') % n.q
      )
  ),
  scored as (
    select
      c.id,
      c.username,
      c.display_name,
      c.avatar_path,
      greatest(
        case
          when lower(c.username::text) = c.q or lower(coalesce(c.display_name, '')) = c.q then 1.0
          when lower(c.username::text) like c.q || '%'
            or lower(coalesce(c.display_name, '')) like c.q || '%' then 0.9
          when lower(c.username::text) like '%' || c.q || '%'
            or lower(coalesce(c.display_name, '')) like '%' || c.q || '%' then 0.8
          else 0.0
        end::real,
        similarity(lower(c.username::text), c.q),
        similarity(lower(coalesce(c.display_name, '')), c.q)
      ) as match_score
    from candidates c
  )
  select
    s.id,
    s.username,
    s.display_name,
    s.avatar_path,
    exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.followee_id = s.id
    ) as is_following,
    s.match_score
  from scored s
  where s.match_score > 0
  order by s.match_score desc, s.username asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function public.search_anglers(text, integer) is
  'Fuzzy member search for the feed search dialog. Ranks by the greater of an exact/prefix/substring ladder and trigram similarity, so partial names and typos both resolve to the intended angler. Excludes the caller. SECURITY INVOKER — profiles RLS still applies.';

grant execute on function public.search_anglers(text, integer) to authenticated;


-- ===========================================================================
-- SECTION 14 — ADMIN LAYER
--
-- Applied by:
--   20260805000000_admin_audit_and_support.sql
--   20260805010000_admin_functions.sql
--   20260805020000_catch_review_detail.sql
--
-- The console is Retool over the Data API, so every admin capability is
-- schema and functions rather than application code. There is one
-- implementation of "verify a catch" regardless of who calls it.
-- ===========================================================================

-- ===========================================================================
-- Admin layer, part 1 of 3: the tables the console writes to.
--
-- The console itself is Retool over the Data API, so everything it can do
-- has to exist here as schema and functions rather than as application code.
-- That is the point: business logic lives in Postgres, and there is exactly
-- one implementation of "verify a catch" no matter who calls it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ADMIN ACTIONS — the audit trail
--
-- Every admin function writes one row here before it returns. Not a
-- convention that can be forgotten: the helper that writes it is the same
-- helper that checks the caller is an admin, so an action that skipped the
-- audit would also have skipped its own authorisation.
--
-- Append-only, enforced twice over. RLS grants no update or delete to
-- anyone, and the trigger below refuses them outright — because the console
-- runs on service_role, which bypasses RLS entirely. Policy alone would
-- protect this table from every caller except the one that actually uses it.
-- ---------------------------------------------------------------------------
create table admin_actions (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable because a system action (a scheduled close, say) has no human
  -- actor. Never nullable *because we did not bother* to record one.
  actor_id     uuid references profiles(id),
  action       text not null,
  target_table text not null,
  target_id    uuid,
  -- Whatever the action needs to be reconstructed later: the reason given,
  -- the before and after values, the arguments it was called with.
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index on admin_actions (created_at desc);
create index on admin_actions (target_table, target_id);
create index on admin_actions (actor_id, created_at desc);

create or replace function private.admin_actions_are_append_only()
returns trigger
language plpgsql as $$
begin
  raise exception 'admin_actions is append-only; % is not permitted', tg_op;
end; $$;

create trigger admin_actions_no_update
  before update or delete on admin_actions
  for each row execute function private.admin_actions_are_append_only();

-- ---------------------------------------------------------------------------
-- SUPPORT
--
-- Threads belong to a member and are worked by staff. Messages carry an
-- internal_note flag so staff can talk to each other in the same thread the
-- member is reading — which is the only reason the flag exists, and the
-- reason the member-facing select policy has to filter on it rather than
-- the app remembering to.
-- ---------------------------------------------------------------------------
create table support_threads (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  subject      text not null,
  status       text not null default 'open'
                 check (status in ('open','waiting','resolved')),
  -- Which admin owns it. Null = unassigned queue.
  assigned_to  uuid references profiles(id),
  -- Set when a thread was opened by the system on the member's behalf, e.g.
  -- request_evidence(). Lets the console separate "member asked us something"
  -- from "we asked the member something".
  opened_by_staff boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on support_threads (member_id, created_at desc);
create index on support_threads (status, updated_at desc);
create index on support_threads (assigned_to, status);

create table support_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references support_threads(id) on delete cascade,
  author_id     uuid references profiles(id),
  body          text not null,
  -- Staff-only. Never returned to the member — see the select policy.
  internal_note boolean not null default false,
  created_at    timestamptz not null default now()
);

create index on support_messages (thread_id, created_at);

-- Keeps the thread list sortable by real activity rather than by when the
-- thread happened to be opened.
create or replace function private.touch_support_thread()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update support_threads set updated_at = now() where id = new.thread_id;
  return null;
end; $$;

create trigger support_messages_touch_thread
  after insert on support_messages
  for each row execute function private.touch_support_thread();

-- ---------------------------------------------------------------------------
-- POST MEDIA — full EXIF
--
-- The parsed columns (exif_taken_at, camera make/model) stay: they are what
-- queries filter on. This is the rest of it, kept verbatim so a reviewer can
-- see what we did *not* parse — GPS, orientation, software tags, lens — when
-- a claim looks wrong. Parsing more fields later is then a question about
-- data we already hold rather than data we threw away.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table admin_actions    enable row level security;
alter table support_threads  enable row level security;
alter table support_messages enable row level security;

-- admin_actions: readable by admins, written only by the security-definer
-- helper. No insert policy for anyone else, and deliberately no update or
-- delete policy at all.
create policy "admin actions readable by admins"
  on admin_actions for select using (public.is_admin());

-- support_threads: your own, or anything if you are staff.
create policy "members read their own threads"
  on support_threads for select
  using (member_id = auth.uid() or public.is_admin());

create policy "members open their own threads"
  on support_threads for insert
  with check (member_id = auth.uid() and not opened_by_staff);

create policy "admins update threads"
  on support_threads for update using (public.is_admin());

-- support_messages: messages on your own threads, minus the internal notes.
create policy "members read replies on their own threads"
  on support_messages for select
  using (
    public.is_admin()
    or (
      not internal_note
      and exists (
        select 1 from support_threads t
        where t.id = support_messages.thread_id and t.member_id = auth.uid()
      )
    )
  );

create policy "members reply on their own threads"
  on support_messages for insert
  with check (
    author_id = auth.uid()
    and not internal_note
    and exists (
      select 1 from support_threads t
      where t.id = support_messages.thread_id and t.member_id = auth.uid()
    )
  );

create policy "admins write messages"
  on support_messages for insert with check (public.is_admin());

-- ===========================================================================
-- Admin layer, part 2 of 3: the functions the console calls.
--
-- All security definer, all admin-gated, all audited. The gate and the audit
-- are the same call — private.admin_audit() — so there is no path that
-- performs an action without recording it, and none that records without
-- having checked.
--
-- Every one of these takes a reason. Standings and money are downstream of
-- most of them, and "who changed this and why" needs to survive the person
-- who did it leaving.
-- ===========================================================================

-- pg_net is what lets trigger_password_reset() reach GoTrue. Postgres cannot
-- mint a recovery link itself — that is an auth-server concern — so the
-- function has to make an HTTP call like any other client would.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- GATE + AUDIT
-- ---------------------------------------------------------------------------

/**
 * Authorise the caller and record what they did, in one call.
 *
 * Accepts two kinds of caller: a signed-in admin (a human in the console
 * with their own account), and service_role (Retool's server-side key).
 * service_role has to be allowed explicitly — it bypasses RLS, but
 * is_admin() reads auth.uid(), which is null for it, so a check on
 * is_admin() alone would lock the console out of its own admin functions.
 *
 * actor_id is therefore null for service_role calls and set for human ones.
 * That distinction is worth keeping: it is the difference between "an admin
 * did this" and "something automated did this".
 */
create or replace function private.admin_audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_detail       jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_detail, '{}'::jsonb));
end; $$;

-- ---------------------------------------------------------------------------
-- CATCH MODERATION
--
-- catches.status is never written by these functions. They insert into
-- catch_reviews and the trigger below propagates it, which makes the review
-- log the cause of a status rather than a note written alongside it. A catch
-- cannot end up verified with no record of who verified it, because the
-- record is the mechanism.
-- ---------------------------------------------------------------------------

create or replace function private.capture_review_from_status()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Filled here rather than by callers so it cannot disagree with reality.
  if new.from_status is null then
    select c.status into new.from_status from catches c where c.id = new.catch_id;
  end if;
  return new;
end; $$;

create trigger catch_reviews_capture_from_status
  before insert on catch_reviews
  for each row execute function private.capture_review_from_status();

create or replace function private.apply_catch_review()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update catches set status = new.to_status where id = new.catch_id;
  return null;
end; $$;

create trigger catch_reviews_apply_status
  after insert on catch_reviews
  for each row execute function private.apply_catch_review();

create or replace function public.verify_catch(p_catch_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('verify_catch', 'catches', p_catch_id,
    jsonb_build_object('reason', p_reason));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'verified', p_reason);
end; $$;

create or replace function public.reject_catch(p_catch_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('reject_catch', 'catches', p_catch_id,
    jsonb_build_object('reason', p_reason));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'rejected', p_reason);
end; $$;

/**
 * Ask the angler for more evidence.
 *
 * Three things happen together and must not come apart: the catch stops
 * counting, the angler is told, and there is somewhere for them to reply.
 * The support thread is the notification — there is no separate
 * notifications table, and adding one to say a single thing that already has
 * a home would be worse. The app surfaces the open thread as a banner on the
 * catch (see the under-review banner in the feed and profile).
 */
create or replace function public.request_evidence(p_catch_id uuid, p_message text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_angler_id uuid;
  v_weight_oz integer;
  v_thread_id uuid;
begin
  select c.angler_id, c.weight_oz into v_angler_id, v_weight_oz
  from catches c where c.id = p_catch_id;
  if v_angler_id is null then
    raise exception 'catch % not found', p_catch_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('request_evidence', 'catches', p_catch_id,
    jsonb_build_object('message', p_message, 'angler_id', v_angler_id));

  insert into catch_reviews (catch_id, reviewer_id, to_status, reason)
  values (p_catch_id, auth.uid(), 'under_review', p_message);

  insert into support_threads (member_id, subject, status, opened_by_staff)
  values (
    v_angler_id,
    'Evidence needed for your ' || (v_weight_oz / 16) || 'lb ' || (v_weight_oz % 16) || 'oz catch',
    'waiting',
    true
  )
  returning id into v_thread_id;

  insert into support_messages (thread_id, author_id, body)
  values (v_thread_id, auth.uid(), p_message);

  return v_thread_id;
end; $$;

-- ---------------------------------------------------------------------------
-- MEMBERS
-- ---------------------------------------------------------------------------

create or replace function public.suspend_member(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('suspend_member', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set suspended_at = now() where id = p_user_id;
end; $$;

create or replace function public.unsuspend_member(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('unsuspend_member', 'profiles', p_user_id,
    jsonb_build_object('reason', p_reason));

  update profiles set suspended_at = null where id = p_user_id;
end; $$;

/**
 * Confirm a declared PB against evidence.
 *
 * Writes the weight as well as the flag, because verification usually
 * settles what the number actually is. The previous value goes in the audit
 * detail — this is the one member field that decides division placement, so
 * "it used to say something else" needs to be answerable.
 */
create or replace function public.verify_pb(p_user_id uuid, p_weight_oz integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before integer;
begin
  select declared_pb_oz into v_before from profiles where id = p_user_id;

  perform private.admin_audit('verify_pb', 'profiles', p_user_id,
    jsonb_build_object('declared_pb_oz_before', v_before, 'declared_pb_oz_after', p_weight_oz));

  update profiles
     set declared_pb_oz = p_weight_oz,
         pb_verified    = true
   where id = p_user_id;
end; $$;

/** Move an angler between divisions mid-season. Records where they came
 * from, since this directly changes who they are competing against for a
 * cash prize. */
create or replace function public.set_division(
  p_user_id     uuid,
  p_season_id   uuid,
  p_division_id uuid,
  p_reason      text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before uuid;
begin
  select division_id into v_before
    from season_entries
   where angler_id = p_user_id and season_id = p_season_id;

  perform private.admin_audit('set_division', 'season_entries', p_user_id,
    jsonb_build_object(
      'season_id', p_season_id,
      'division_before', v_before,
      'division_after', p_division_id,
      'reason', p_reason
    ));

  update season_entries
     set division_id = p_division_id
   where angler_id = p_user_id and season_id = p_season_id;

  if not found then
    raise exception 'no season entry for angler % in season %', p_user_id, p_season_id
      using errcode = 'P0002';
  end if;
end; $$;

/**
 * Send the member a password reset.
 *
 * Postgres cannot mint a recovery link — GoTrue owns that — so this calls
 * the auth admin API over pg_net. The service key comes from Vault rather
 * than being written into the function body, because a function definition
 * is readable by anyone who can read the catalogue.
 *
 * Setup, once, before this works:
 *   select vault.create_secret('<service_role_key>', 'service_role_key');
 *   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
 *
 * Fire-and-forget by design: pg_net queues the request and returns an id.
 * The audit row is the record that we asked, not proof the email arrived.
 */
create or replace function public.trigger_password_reset(p_user_id uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_email       text;
  v_service_key text;
  v_project_url text;
  v_request_id  bigint;
begin
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('trigger_password_reset', 'profiles', p_user_id, '{}'::jsonb);

  select decrypted_secret into v_service_key
    from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'project_url';

  if v_service_key is null or v_project_url is null then
    raise exception
      'vault secrets service_role_key and project_url must be set before password resets can be sent'
      using errcode = '55000';
  end if;

  select net.http_post(
    url     := v_project_url || '/auth/v1/recover',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', v_service_key,
                 'Authorization', 'Bearer ' || v_service_key
               ),
    body    := jsonb_build_object('email', v_email)
  ) into v_request_id;

  return v_request_id;
end; $$;

/**
 * Change a member's sign-in email.
 *
 * Writes auth.users directly, which skips the confirm-both-addresses dance
 * GoTrue normally runs. That is the point — this exists for the case where
 * the member has lost the old address and cannot confirm anything — but it
 * means the new address is trusted on an admin's say-so, so the old one is
 * kept in the audit detail.
 */
create or replace function public.update_member_email(p_user_id uuid, p_new_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select email into v_before from auth.users where id = p_user_id;
  if v_before is null then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('update_member_email', 'profiles', p_user_id,
    jsonb_build_object('email_before', v_before, 'email_after', p_new_email));

  update auth.users
     set email              = p_new_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = p_user_id;
end; $$;

-- ---------------------------------------------------------------------------
-- VENUES
-- ---------------------------------------------------------------------------

/**
 * Fold a duplicate venue into the one that survives.
 *
 * Never deletes. The loser keeps its row with merged_into set, so a catch
 * logged against it still resolves and an old link still works — and so the
 * merge can be reasoned about afterwards, which a delete makes impossible.
 * Catches are repointed because the venue's weight distribution is a fraud
 * signal (see private.venue_distributions), and a distribution split across
 * two spellings of the same lake is worth less than one.
 */
create or replace function public.merge_venues(p_loser_id uuid, p_survivor_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_moved integer;
begin
  if p_loser_id = p_survivor_id then
    raise exception 'cannot merge a venue into itself' using errcode = '22023';
  end if;

  perform private.admin_audit('merge_venues', 'venues', p_loser_id,
    jsonb_build_object('survivor_id', p_survivor_id));

  update catches set venue_id = p_survivor_id where venue_id = p_loser_id;
  get diagnostics v_moved = row_count;

  update venues set merged_into = p_survivor_id where id = p_loser_id;

  -- Recorded a second time now the count is known, so the audit says how
  -- much moved rather than only that a merge was attempted.
  perform private.admin_audit('merge_venues_complete', 'venues', p_loser_id,
    jsonb_build_object('survivor_id', p_survivor_id, 'catches_moved', v_moved));

  return v_moved;
end; $$;

create or replace function public.approve_venue(p_venue_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.admin_audit('approve_venue', 'venues', p_venue_id, '{}'::jsonb);
  update venues set approved = true where id = p_venue_id;
end; $$;

-- ---------------------------------------------------------------------------
-- SEASONS
--
-- Only one season may be `running` at a time. The app resolves the current
-- season with a single-row lookup on that status — league tables, the PB
-- calculation, the divisions page — so a second running season would not
-- produce a merged league, it would produce whichever row came back first.
-- Enforced as an index rather than as a rule inside open_season(), so it
-- also holds against a hand-written update in the console.
-- ---------------------------------------------------------------------------
create unique index if not exists seasons_one_running
  on seasons ((status)) where status = 'running';

create or replace function public.create_season(
  p_name          text,
  p_starts_on     date,
  p_ends_on       date,
  p_counting_fish smallint
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_ends_on <= p_starts_on then
    raise exception 'season must end after it starts' using errcode = '22023';
  end if;

  insert into seasons (name, starts_on, ends_on, counting_fish)
  values (p_name, p_starts_on, p_ends_on, p_counting_fish)
  returning id into v_id;

  perform private.admin_audit('create_season', 'seasons', v_id,
    jsonb_build_object('name', p_name, 'starts_on', p_starts_on,
                       'ends_on', p_ends_on, 'counting_fish', p_counting_fish));

  return v_id;
end; $$;

/**
 * Retune a season's scoring.
 *
 * The whole point of scoring being computed rather than stored: this
 * re-scores every leaderboard the moment it commits, with no backfill. The
 * before values are audited because that also means there is no other record
 * of what the table looked like an hour ago.
 */
create or replace function public.set_scoring(
  p_season_id        uuid,
  p_multiplier       numeric,
  p_offset_oz        integer,
  p_exponent         numeric,
  p_min_qualifying   integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  select to_jsonb(s) - 'id' - 'name' - 'created_at' into v_before
    from seasons s where s.id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('set_scoring', 'seasons', p_season_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'scoring_multiplier', p_multiplier,
        'scoring_offset_oz', p_offset_oz,
        'scoring_exponent', p_exponent,
        'min_qualifying_oz', p_min_qualifying
      )
    ));

  update seasons
     set scoring_multiplier = p_multiplier,
         scoring_offset_oz  = p_offset_oz,
         scoring_exponent   = p_exponent,
         min_qualifying_oz  = p_min_qualifying
   where id = p_season_id;
end; $$;

/** Resize a division's PB band. Audited with the old bounds because this
 * decides who is seeded where next season. */
create or replace function public.set_division_boundaries(
  p_division_id uuid,
  p_min_pb_oz   integer,
  p_max_pb_oz   integer
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  select jsonb_build_object('min_pb_oz', d.min_pb_oz, 'max_pb_oz', d.max_pb_oz)
    into v_before from divisions d where d.id = p_division_id;
  if v_before is null then
    raise exception 'division % not found', p_division_id using errcode = 'P0002';
  end if;

  if p_min_pb_oz is not null and p_max_pb_oz is not null and p_max_pb_oz < p_min_pb_oz then
    raise exception 'max_pb_oz must not be below min_pb_oz' using errcode = '22023';
  end if;

  perform private.admin_audit('set_division_boundaries', 'divisions', p_division_id,
    jsonb_build_object('before', v_before,
                       'after', jsonb_build_object('min_pb_oz', p_min_pb_oz, 'max_pb_oz', p_max_pb_oz)));

  update divisions
     set min_pb_oz = p_min_pb_oz,
         max_pb_oz = p_max_pb_oz
   where id = p_division_id;
end; $$;

/** Make a season live. `running` is the status the app treats as current —
 * see the single-running index above. */
create or replace function public.open_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select status into v_before from seasons where id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;
  if v_before = 'closed' then
    raise exception 'season % is closed and cannot be reopened', p_season_id using errcode = '22023';
  end if;

  perform private.admin_audit('open_season', 'seasons', p_season_id,
    jsonb_build_object('status_before', v_before, 'status_after', 'running'));

  update seasons set status = 'running' where id = p_season_id;
end; $$;

/** Close a season. Final standings are still computed from the same views —
 * closing stops new catches counting, it does not freeze a table anywhere,
 * because nothing is stored to freeze. */
create or replace function public.close_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  select status into v_before from seasons where id = p_season_id;
  if v_before is null then
    raise exception 'season % not found', p_season_id using errcode = 'P0002';
  end if;

  perform private.admin_audit('close_season', 'seasons', p_season_id,
    jsonb_build_object('status_before', v_before));

  update seasons set status = 'closed' where id = p_season_id;
end; $$;

-- ---------------------------------------------------------------------------
-- GRANTS
--
-- anon loses execute outright — nothing here should be reachable without a
-- session. `authenticated` keeps it, because these are gated in the body and
-- a signed-in admin working in the console under their own account is a
-- supported caller; revoking it would leave the is_admin() branch of
-- admin_audit() as dead code and service_role as the only way in, which
-- costs the audit trail its actor_id.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.verify_catch(uuid,text)',
    'public.reject_catch(uuid,text)',
    'public.request_evidence(uuid,text)',
    'public.suspend_member(uuid,text)',
    'public.unsuspend_member(uuid,text)',
    'public.verify_pb(uuid,integer)',
    'public.set_division(uuid,uuid,uuid,text)',
    'public.trigger_password_reset(uuid)',
    'public.update_member_email(uuid,text)',
    'public.merge_venues(uuid,uuid)',
    'public.approve_venue(uuid)',
    'public.create_season(text,date,date,smallint)',
    'public.set_scoring(uuid,numeric,integer,numeric,integer)',
    'public.set_division_boundaries(uuid,integer,integer)',
    'public.open_season(uuid)',
    'public.close_season(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to service_role, authenticated', fn);
  end loop;
end $$;

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

-- ===========================================================================
-- Let the admin functions be called over a direct database connection.
--
-- The console has to reach two things that do not live behind the same door:
--
--   private.catch_review_detail  — the private schema is not exposed through
--                                  the Data API, by design, so PostgREST
--                                  cannot see it at all.
--   the admin functions          — gated on auth.role() = 'service_role',
--                                  which only exists on a PostgREST request.
--
-- So a REST connection can call the functions but not read the review view,
-- and a direct Postgres connection can read the view but was refused by
-- every function. Neither alone was enough to run a console with, which was
-- a gap in the original build rather than a Retool quirk.
--
-- A direct session authenticating as postgres or service_role is already
-- trusted with far more than these functions expose — it can write the
-- tables underneath them — so accepting it here loses nothing. What it would
-- have lost is the audit trail, since auth.uid() is null on such a
-- connection: see app.admin_actor below.
-- ===========================================================================

create or replace function private.admin_audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_detail       jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role   text := coalesce(auth.role(), '');
  v_db_role    text := current_user;
  v_operator   text := nullif(current_setting('app.admin_actor', true), '');
  v_detail     jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_jwt_role <> 'service_role'
     and v_db_role not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  -- Who actually did it.
  --
  -- actor_id can only be filled from a session that has one, which a direct
  -- connection does not — every Retool action would otherwise be recorded as
  -- an anonymous system event, and "who changed this" is half the point of
  -- the table. So the console names its operator per query:
  --
  --   select set_config('app.admin_actor', '{{ current_user.email }}', true);
  --
  -- Local to the transaction, so it cannot leak between pooled queries. It
  -- is self-declared and therefore not proof of anything on its own — but it
  -- is recorded alongside the database role that was actually used, which is.
  v_detail := v_detail || jsonb_build_object(
    'db_role', v_db_role,
    'jwt_role', nullif(v_jwt_role, '')
  );
  if v_operator is not null then
    v_detail := v_detail || jsonb_build_object('operator', v_operator);
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, v_detail);
end; $$;

-- ===========================================================================
-- SECURITY FIX — the admin gate was open to any signed-in member.
--
-- 20260805030000 widened private.admin_audit() to accept a direct database
-- connection, so the Retool console could reach both the admin functions and
-- the private review view. It tested current_user against a list of trusted
-- roles. That was wrong, and wrong in the worst direction.
--
-- Inside a SECURITY DEFINER function, current_user is the function's OWNER,
-- not its caller — that is the whole point of SECURITY DEFINER. These
-- functions are owned by postgres, so current_user was always 'postgres',
-- the check always passed, and every admin function became callable by any
-- authenticated angler: suspend a member, verify a catch, retune scoring.
-- Confirmed against the live project before writing this, with an ordinary
-- member account calling suspend_member successfully.
--
-- session_user is the role that actually opened the connection and is not
-- rewritten by SECURITY DEFINER. Through PostgREST that is 'authenticator'
-- for anon and authenticated alike, so an API caller can no longer satisfy
-- the trusted-connection branch at all and has to pass is_admin() like
-- anything else. A direct psql or Retool session still authenticates as
-- postgres and is still accepted.
--
-- Lesson for anything added here later: a gate that widens access must be
-- tested from the outside, as the least privileged caller. This one was
-- tested by confirming the console still worked, which it did, and which
-- proved nothing about who else it now let in.
-- ===========================================================================

create or replace function private.admin_audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_detail       jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role  text := coalesce(auth.role(), '');
  -- session_user, NOT current_user. See the header.
  v_conn_role text := session_user;
  v_operator  text := nullif(current_setting('app.admin_actor', true), '');
  v_detail    jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if v_jwt_role <> 'service_role'
     and v_conn_role not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  v_detail := v_detail || jsonb_build_object(
    'conn_role', v_conn_role,
    'jwt_role', nullif(v_jwt_role, '')
  );
  if v_operator is not null then
    v_detail := v_detail || jsonb_build_object('operator', v_operator);
  end if;

  insert into admin_actions (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, v_detail);
end; $$;

-- --- deleting a post -------------------------------------------------------
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
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- ===========================================================================
-- Deleting your own comment.
--
-- Doing it as a plain UPDATE from the client does not work. With the author's
-- own session, `update comments set body = ...` succeeds and
-- `update comments set deleted_at = now()` on the same row fails with "new
-- row violates row-level security policy" — so the UPDATE policy's check on
-- author_id is satisfied either way, and it is specifically the column that
-- is refused.
--
-- The cause is the interaction between the soft delete and
-- `comments readable by all`, which is `for select using (deleted_at is
-- null)`: the updated row is one the author may no longer read, and the
-- write is rejected on the way out rather than on the way in. I have not
-- pinned down the exact rule that produces it, so this does not try to
-- outsmart it.
--
-- A security definer function is the honest fix rather than the clever one.
-- It states the rule it enforces — you may delete your own comment and no
-- one else's — in one place, and it does not depend on how a policy and a
-- returning clause happen to interact. Loosening the select policy to let
-- authors see their own deleted comments would also work and is worse: every
-- query that lists comments would then have to remember to filter them out,
-- which is exactly the job the policy was doing.
-- ===========================================================================

create or replace function public.delete_own_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_author_id uuid;
  v_deleted   timestamptz;
begin
  select c.author_id, c.deleted_at into v_author_id, v_deleted
    from comments c where c.id = p_comment_id;

  if v_author_id is null then
    raise exception 'comment % not found', p_comment_id using errcode = 'P0002';
  end if;
  if v_author_id <> auth.uid() then
    raise exception 'you can only delete your own comments' using errcode = '42501';
  end if;
  if v_deleted is not null then
    return; -- already gone; deleting twice is not an error worth raising
  end if;

  -- posts.comment_count is corrected by the trigger on deleted_at
  -- (20260805060000), so nothing here touches it.
  update comments set deleted_at = now() where id = p_comment_id;
end; $$;

revoke all on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated, service_role;
