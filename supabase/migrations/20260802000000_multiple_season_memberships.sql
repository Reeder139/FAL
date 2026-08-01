-- ============================================================================
-- Allow multiple membership periods per angler per season, and gate scoring
-- to catches made during an active membership period.
--
-- Why: season_entries previously enforced exactly one row per
-- (season_id, angler_id), so an angler who left a season and rejoined later
-- had nowhere to record the second period. left_at marks when a membership
-- period ended (null = still active); prize_eligible lets a late/rejoined
-- entry keep fishing and scoring without counting toward prizes, without a
-- separate mechanism.
-- ============================================================================

alter table season_entries
  drop constraint season_entries_season_id_angler_id_key;

alter table season_entries
  add column left_at timestamptz;

alter table season_entries
  add column prize_eligible boolean not null default true;


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
