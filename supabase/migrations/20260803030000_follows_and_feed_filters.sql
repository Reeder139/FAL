-- Follows already exists in the schema but was never indexed or counted.
-- Adds the two lookup indexes, follower/following counters on profiles kept
-- by a trigger (same pattern as bump_post_counters for likes/comments), and
-- three feed-filtering views for the Following/All/My League segments.

create index on follows (follower_id);
create index on follows (followee_id);

alter table profiles
  add column follower_count  integer not null default 0,
  add column following_count integer not null default 0;

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
-- FEED FILTERS
-- All three build on feed_items (posts + author + optional catch/venue),
-- ordered created_at desc. security_invoker = on so each still respects the
-- caller's own RLS on posts/follows/season_entries underneath — same rule
-- as every other view in this schema.
-- ============================================================================

-- Posts by people the caller follows, plus their own.
create or replace view feed_following
with (security_invoker = on) as
select fi.*
from feed_items fi
where fi.author_id = auth.uid()
   or fi.author_id in (select f.followee_id from follows f where f.follower_id = auth.uid())
order by fi.created_at desc;

-- All public posts. feed_items doesn't expose posts.visibility, but its
-- underlying RLS select policy ("public posts readable") already means
-- every caller only ever sees visibility = 'public' rows through it
-- regardless — this view exists to name that contract explicitly rather
-- than leave it as an implicit side effect of feed_items' own policy.
create or replace view feed_all
with (security_invoker = on) as
select fi.*
from feed_items fi
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
