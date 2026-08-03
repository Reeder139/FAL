-- posts RLS (previous migration) now also lets followers- and
-- league_only-visibility rows through to the people they're meant for, not
-- just public ones. feed_all is specifically "all PUBLIC posts" — a global
-- feed, not "everything RLS happens to let this viewer see" — so it can no
-- longer lean on RLS to coincidentally narrow it the way the old, stricter
-- policy did. Needs its own explicit filter, which means feed_items needs
-- to expose visibility for it to filter on.

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

create or replace view feed_all
with (security_invoker = on) as
select fi.*
from feed_items fi
where fi.visibility = 'public'
order by fi.created_at desc;
