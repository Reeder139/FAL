-- The "one counting fish per 24 hours" rule is dropped.
--
-- It was never implemented. It existed only as a TODO comment sitting
-- between scored_catches and league_table, reserving a filter that was never
-- written. This re-issues the view to retire that reservation.
--
-- Structurally a no-op, deliberately so: Postgres does not store SQL `--`
-- comments, so the comment was never in the database to begin with, and the
-- view body below is byte-for-byte what 20260802000000 already installed.
-- The migration exists to date the decision in the history rather than to
-- change the schema — running it against a database at any point after
-- 20260802000000 leaves scored_catches exactly as it found it.
--
-- There is no cap on counting fish per session or per day, and none should
-- be added. An angler's counting fish are their top `counting_fish` scores
-- in the season by rank_in_season, with no time-based filter.

-- Every counting fish, ranked within its angler's season — only scores if
-- the catch falls inside an active membership period for that entry.
create or replace view scored_catches
with (security_invoker = on) as
select
  c.id            as catch_id,
  c.angler_id,
  se.season_id,
  se.division_id,
  se.tier,
  c.weight_oz,
  c.caught_at,
  fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
             s.scoring_exponent, s.min_qualifying_oz)
    * case when c.is_pb then s.pb_bonus_multiplier else 1 end
    * case when c.fish_name is not null then s.named_fish_multiplier else 1 end
                  as points,
  row_number() over (
    partition by c.angler_id, se.season_id
    order by fal_points(c.weight_oz, s.scoring_multiplier, s.scoring_offset_oz,
                        s.scoring_exponent, s.min_qualifying_oz) desc,
             c.caught_at asc
  )               as rank_in_season
from catches c
join season_entries se on se.angler_id = c.angler_id
join seasons s         on s.id = se.season_id
where c.status = 'verified'
  and c.caught_at::date between s.starts_on and s.ends_on
  and c.caught_at >= se.joined_at
  and (se.left_at is null or c.caught_at < se.left_at);
