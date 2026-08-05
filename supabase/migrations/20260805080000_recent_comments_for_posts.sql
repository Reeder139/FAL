-- ===========================================================================
-- The last few comments on each of a page of posts, in one round trip.
--
-- The feed shows a couple of comments under every post. Fetching them per
-- card is twenty queries for a twenty-post page, on every scroll — the same
-- N+1 the hero images and the like state are already batched to avoid.
--
-- Fetching *all* comments for the page and slicing client-side would be one
-- query but unbounded: a post with four hundred comments would drag all four
-- hundred over the wire to show two. row_number() does the slicing in the
-- database, so the page costs what it displays.
--
-- security invoker, like every other view and function here: comments are
-- already filtered by their own select policy, and a definer function would
-- quietly hand back rows the caller could not otherwise read.
-- ===========================================================================

create or replace function public.recent_comments_for_posts(
  p_post_ids uuid[],
  p_limit    integer default 2
)
returns table (
  post_id     uuid,
  id          uuid,
  author_id   uuid,
  username    text,
  avatar_path text,
  body        text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = public as $$
  select r.post_id, r.id, r.author_id, pr.username::text, pr.avatar_path, r.body, r.created_at
  from (
    select c.*,
           row_number() over (partition by c.post_id order by c.created_at desc) as rn
      from comments c
     where c.post_id = any(p_post_ids)
       and c.deleted_at is null
  ) r
  join profiles pr on pr.id = r.author_id
  where r.rn <= greatest(p_limit, 0)
  -- Ascending within a post: the preview reads downward like the thread it
  -- is a window onto, even though the rows were picked newest-first.
  order by r.post_id, r.created_at;
$$;

revoke all on function public.recent_comments_for_posts(uuid[], integer) from public;
grant execute on function public.recent_comments_for_posts(uuid[], integer) to anon, authenticated, service_role;
