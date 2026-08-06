-- ===========================================================================
-- Give division_league_table a position, so the client can read a divisional
-- standing without going through league_table_with_ghost.
--
-- Left off first time round because league_table_with_ghost numbers the rows
-- itself. But the League Position strip and the division stat blocks read a
-- table directly, and were still reading league_table — so a mid-season
-- joiner saw their divisional row correctly scored at 15.9 while the strip
-- above it and the "TOP SCORE" beside it both said 134.3, which is the
-- national figure. Three numbers, one screen, two of them answering a
-- question nobody asked.
--
-- A plain rank() is right here where it would not be in league_table_with_
-- ghost: this view only ever contains `competitor` stints, so ranking over
-- all of it is already "position among paying anglers". Ties share a number,
-- matching the count-ahead arithmetic in the function.
-- ===========================================================================

create or replace view division_league_table
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
from division_scored_catches sc
join seasons s on s.id = sc.season_id
where sc.rank_in_season <= s.counting_fish
group by sc.season_id, sc.division_id, sc.angler_id;
