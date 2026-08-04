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
  created_at          timestamptz not null default now(),

  -- Kept by bump_follow_counters() (see COUNTER TRIGGERS below) — never
  -- written to directly.
  follower_count      integer not null default 0,
  following_count     integer not null default 0
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

-- The "FF League": one national standing across every division in a
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
  on posts for update using (auth.uid() = author_id);

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
  on comments for update using (auth.uid() = author_id);

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
