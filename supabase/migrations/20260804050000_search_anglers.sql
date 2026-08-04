-- Member search for the feed's search dialog.
--
-- Ranked, not merely filtered. The requirement is that results are "nearest
-- possible to what the user entered", which plain ilike cannot do: '%reder%'
-- misses "reeder139" outright, so a single dropped letter returns nothing
-- and the feature looks broken. This scores every candidate and orders by
-- the score instead.
--
-- Two scoring mechanisms, taken as the greater of the two, because each
-- covers the other's blind spot:
--
--   * An exact / prefix / substring ladder. Someone typing the first three
--     letters of a username expects that person top of the list, and raw
--     trigram similarity ranks a short query against a long name poorly —
--     "ree" against "reeder139" shares few trigrams relative to the length,
--     scoring low despite being a perfect prefix.
--   * Trigram similarity, which is what actually absorbs typos and
--     transpositions that no substring test will match.
--
-- Candidates are narrowed first by an indexable predicate (ilike, plus the
-- trigram `%` operator) so this doesn't seq-scan profiles as membership
-- grows; scoring then runs only over that shortlist.

create extension if not exists pg_trgm with schema extensions;

-- GIN trigram indexes. These serve both the `%` operator and the ilike
-- substring patterns — pg_trgm indexes support LIKE/ILIKE, which a plain
-- btree cannot for a leading-wildcard match.
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin ((username::text) extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

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
-- SECURITY INVOKER (the default, stated here because it matters): profiles
-- RLS still applies, so this exposes nothing the client couldn't already
-- select for itself. search_path is pinned so `%` and similarity() resolve
-- to pg_trgm in the extensions schema regardless of the caller's path.
security invoker
set search_path = public, extensions
as $$
  with needle as (
    select
      lower(btrim(p_query)) as q,
      -- LIKE metacharacters in the raw input are escaped: a member typing
      -- "100%" should search for that text, not glob every profile.
      replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') as q_like
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
