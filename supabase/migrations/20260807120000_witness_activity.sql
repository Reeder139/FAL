-- ===========================================================================
-- Witness requests and answers reach the Activity tab.
--
-- Restated in full rather than patched: the events CTE is a union and the new
-- branches go inside it. Everything else is byte-for-byte what 20260807060000
-- left — including the column alias list on `events e`, which is what names
-- these columns at all.
--
-- Three branches, because the two sides of a witness request are different
-- news. The witness is being asked something and has to act; the angler is
-- being told an answer.
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
    union all

    -- Someone has asked you to witness their catch. Only while it is still
    -- pending: once answered it is no longer a thing to act on, and leaving
    -- it on the feed would invite a second answer that respond_to_witness
    -- would refuse anyway.
    select
      'witness_request'::text, w.created_at, w.nominated_by, c.post_id,
      c.id, null::text
    from catch_witnesses w
    join catches c on c.id = w.catch_id
    cross join me
    where w.witness_id = me.id and w.status = 'pending'

    union all

    -- Your witness answered. Both answers are news: a decline is the one you
    -- most need to know about.
    select
      ('witness_' || w.status)::text, w.responded_at, w.witness_id, c.post_id,
      c.id, null::text
    from catch_witnesses w
    join catches c on c.id = w.catch_id
    cross join me
    where w.nominated_by = me.id and w.status <> 'pending'

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
