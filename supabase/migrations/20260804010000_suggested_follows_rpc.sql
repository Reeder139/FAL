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
        lt.position,
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
