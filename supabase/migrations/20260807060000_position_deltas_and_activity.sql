-- ===========================================================================
-- The arrow's number, and position moves on the Activity tab.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- How far an angler has moved since this time yesterday.
--
-- Positive is up the table — a smaller position number — because "▲3" means
-- three places better, and having the sign match the arrow is worth more than
-- having it match the underlying subtraction.
--
-- Null when there is nothing to compare against: no season, no current
-- position, or nothing recorded from before the cutoff. Null is what the
-- strip needs in order to draw no arrow at all, which is the honest answer for
-- an angler who only appeared in the table this morning. Zero would claim they
-- had held station.
-- ---------------------------------------------------------------------------
create or replace function public.league_position_delta(
  p_angler_id uuid,
  p_scope     text,
  p_since     interval default interval '24 hours'
)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  v_season   seasons%rowtype;
  v_current  integer;
  v_previous integer;
begin
  v_season := public.season_for_date(current_date);
  if v_season.id is null then
    return null;
  end if;

  if p_scope = 'national' then
    select n.position::integer into v_current
    from national_league_table n
    where n.season_id = v_season.id and n.angler_id = p_angler_id;
  else
    select r.position into v_current
    from (
      select dl.angler_id,
             rank() over (partition by dl.division_id order by dl.total_points desc)::integer as position
      from division_league_table dl
      where dl.season_id = v_season.id
    ) r
    where r.angler_id = p_angler_id;
  end if;

  if v_current is null then
    return null;
  end if;

  -- The last position recorded at or before the cutoff. Not "the row from
  -- yesterday" — there may not be one, because rows are written only when a
  -- position changes. The most recent one before the cutoff is where they
  -- stood at the cutoff.
  select h.position into v_previous
  from league_position_history h
  where h.angler_id = p_angler_id
    and h.scope = p_scope
    and h.season_id = v_season.id
    and h.recorded_at <= now() - p_since
  order by h.recorded_at desc
  limit 1;

  if v_previous is null then
    return null;
  end if;

  return v_previous - v_current;
end; $$;

revoke all on function public.league_position_delta(uuid, text, interval) from public, anon;
grant execute on function public.league_position_delta(uuid, text, interval)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Position moves join the Activity tab.
--
-- Restated in full rather than patched: the events CTE is a union and the new
-- branch has to go inside it. Everything else is byte-for-byte what
-- 20260806060000 left — including the column alias list on `events e`, which
-- is what names these columns at all, and the deleted_at guards that keep
-- removed posts and comments off the feed.
-- ---------------------------------------------------------------------------
create or replace function public.activity_feed(
  p_limit  integer     default 40,
  p_before timestamptz default null
)
returns table (
  kind              text,
  occurred_at       timestamptz,
  actor_id          uuid,
  actor_username    citext,
  actor_avatar_path text,
  post_id           uuid,
  catch_id          uuid,
  weight_oz         integer,
  photo_path        text,
  body              text
)
language sql stable as $$
  with me as (select auth.uid() as id),
  -- The hero shot of a post, for the thumbnail on the row. Pulled once
  -- rather than joined per branch.
  hero as (
    select pm.post_id, min(pm.storage_path) as storage_path
    from post_media pm
    where pm.media_role = 'hero'
    group by pm.post_id
  ),
  events as (
    -- Someone liked your post.
    select
      'like'::text, l.created_at, l.user_id, p.id as post_id,
      null::uuid as catch_id, null::text as body
    from likes l
    join posts p on p.id = l.post_id
    cross join me
    where p.author_id = me.id
      and p.deleted_at is null
      and l.user_id <> me.id

    union all

    -- Someone commented on your post. Your own comments are not news to you.
    select
      'comment'::text, c.created_at, c.author_id, c.post_id,
      null::uuid, left(c.body, 140)
    from comments c
    join posts p on p.id = c.post_id
    cross join me
    where p.author_id = me.id
      and p.deleted_at is null
      and c.deleted_at is null
      and c.author_id <> me.id
      -- Not if it is a reply to one of your own comments: that is the
      -- branch below, and listing it in both put the same remark on the
      -- feed twice.
      and not exists (
        select 1 from comments parent
        where parent.id = c.parent_id and parent.author_id = me.id
      )

    union all

    -- Someone replied to a comment of yours, on anybody's post.
    select
      'reply'::text, c.created_at, c.author_id, c.post_id,
      null::uuid, left(c.body, 140)
    from comments c
    join comments parent on parent.id = c.parent_id
    join posts p on p.id = c.post_id
    cross join me
    where parent.author_id = me.id
      and parent.deleted_at is null
      and c.deleted_at is null
      and c.author_id <> me.id
      and p.deleted_at is null

    union all

    -- Someone followed you.
    select
      'follow'::text, f.created_at, f.follower_id, null::uuid,
      null::uuid, null::text
    from follows f
    cross join me
    where f.followee_id = me.id

    union all

    -- A decision was made about one of your catches. reviewer_id is null for
    -- the automatic review submit_catch writes, and for anything done by
    -- service_role, so there is often no actor to name — the row reads as
    -- "your catch was verified" rather than naming a person, which is also
    -- the right thing for the angler to see.
    select
      ('catch_' || cr.to_status)::text, cr.created_at, cr.reviewer_id, c.post_id,
      c.id, cr.reason
    from catch_reviews cr
    join catches c on c.id = cr.catch_id
    cross join me
    where c.angler_id = me.id

    union all

    -- You moved in a league. The actor is whoever passed you, where one
    -- angler is nameable; otherwise there is none and the row reads as
    -- movement rather than as something a person did to you.
    --
    -- The body carries the scope and both positions, because the row has
    -- nowhere else to put them and the screen should not have to re-query the
    -- league to say "3rd to 5th".
    select
      ('position_' || e.kind)::text, e.occurred_at, e.other_angler_id, null::uuid,
      null::uuid, e.scope || ':' || e.from_position || ':' || e.to_position
    from league_position_events e
    cross join me
    where e.angler_id = me.id
  )
  select
    e.kind,
    e.created_at,
    e.actor_id,
    pr.username,
    pr.avatar_path,
    e.post_id,
    e.catch_id,
    ca.weight_oz,
    h.storage_path,
    e.body
  from events e (kind, created_at, actor_id, post_id, catch_id, body)
  left join profiles pr on pr.id = e.actor_id
  left join catches  ca on ca.id = e.catch_id
  left join hero     h  on h.post_id = e.post_id
  where p_before is null or e.created_at < p_before
  order by e.created_at desc
  limit greatest(p_limit, 1);
$$;
