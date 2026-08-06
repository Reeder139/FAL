-- ===========================================================================
-- The Activity tab.
--
-- Derived, not stored. There is no notifications table and no trigger writing
-- rows on every like — the events already exist in likes, comments, follows
-- and catch_reviews, and a second copy of them would be a second thing to
-- keep in step. Delete a comment and the notification about it should go with
-- it; that is free here and needs a cascade otherwise.
--
-- Same reasoning as scoring being computed on read. It costs a union of five
-- indexed queries per page view, which is the right trade at this size and
-- can be revisited if the feed ever gets long enough to hurt.
--
-- Not SECURITY DEFINER. Every source table is already readable by the person
-- these events are about — likes and follows broadly, comments when not
-- deleted, and catch_reviews by the catch's owner under "reviews readable by
-- owner and admins". So this runs as the caller and RLS keeps it honest,
-- rather than the function having to re-implement who may see what.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- When the angler last looked. One timestamp rather than a read flag per
-- event: with the events themselves derived there is no row to mark, and
-- "everything since you last opened the tab" is what the badge means anyway.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists activity_read_at timestamptz;

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

-- ---------------------------------------------------------------------------
-- How many of those the angler has not seen. Deliberately a separate, cheap
-- call: the badge is read on every screen and should not pull a page of rows
-- with their profiles, catches and photos attached.
-- ---------------------------------------------------------------------------
create or replace function public.activity_unread_count()
returns integer
language sql stable as $$
  select count(*)::integer
  from public.activity_feed(500, null) a
  where a.occurred_at > coalesce(
    (select p.activity_read_at from profiles p where p.id = auth.uid()),
    '-infinity'::timestamptz
  );
$$;

-- ---------------------------------------------------------------------------
-- Mark everything up to now as seen.
--
-- SECURITY DEFINER only because profiles' update policy is written for a
-- member editing their own profile fields, and this is the app writing a
-- housekeeping timestamp. It writes exactly one column, for exactly the
-- caller, and cannot be pointed at anyone else.
-- ---------------------------------------------------------------------------
create or replace function public.mark_activity_read()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in' using errcode = '42501';
  end if;
  update profiles set activity_read_at = now() where id = auth.uid();
end; $$;

revoke all on function public.mark_activity_read() from public, anon;
grant execute on function public.mark_activity_read() to authenticated, service_role;
