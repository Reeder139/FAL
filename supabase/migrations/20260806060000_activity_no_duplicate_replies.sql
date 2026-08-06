-- ===========================================================================
-- One event per thing that happened.
--
-- A reply to your own comment on your own post satisfied both the "commented
-- on your post" branch and the "replied to your comment" branch, so it
-- appeared on the feed twice — caught by reading the output of the test
-- rather than by the assertions, which were all passing.
--
-- The reply branch is the more specific of the two and keeps it.
-- ===========================================================================

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
