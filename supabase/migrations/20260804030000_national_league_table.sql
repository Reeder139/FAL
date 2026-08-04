-- The "FF League" table: one national standing across every division in a
-- season. Bragging rights only — no prize money attaches to it, unlike the
-- divisional tables.
--
-- This can't just read league_table, because that view's `position` is
-- rank() partitioned by division — a per-division placing. Ranking
-- nationally means re-ranking over the whole season, so this aggregates
-- from scored_catches directly, exactly as league_table does, and only
-- changes the partition.
--
-- Deliberately NOT filtered by season_entries.tier: it includes everyone
-- with an active entry in the season, which is what the divisional tables
-- already do. Gating it to tier = 'competitor' would make the national
-- table inconsistent with the divisional ones it mirrors.
create or replace view national_league_table
with (security_invoker = on) as
select
  sc.season_id,
  sc.angler_id,
  sc.division_id,
  sum(sc.points)    as total_points,
  count(*)          as counting_fish,
  max(sc.weight_oz) as best_fish_oz,
  rank() over (
    partition by sc.season_id
    order by sum(sc.points) desc
  )                 as position
from scored_catches sc
join seasons s on s.id = sc.season_id
where sc.rank_in_season <= s.counting_fish
group by sc.season_id, sc.angler_id, sc.division_id, s.counting_fish;
