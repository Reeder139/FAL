-- ===========================================================================
-- The winter half of the calendar.
--
-- Winter 2026/27 through Winter 2036/37 — eleven seasons, each running
-- 1 October to 31 March, interleaving with the summers so that every day
-- from 2026-04-01 to 2037-09-30 falls inside exactly one season. No gaps,
-- no overlaps.
--
-- That gapless property is worth more than tidiness. A catch only scores if
-- caught_at falls inside its season's date range, so before this there were
-- six months a year in which a fish could be logged, verified, and score
-- nothing — the log-catch form has to warn "this isn't inside a running
-- season" for half the calendar. Once these are opened, that warning becomes
-- what it should be: a sign something is wrong, not a fact of winter.
--
-- counting_fish is 3, not 5. That is not a guess — it is what the column has
-- said since the schema was written ("5 summer, 3 winter"). Fewer fish over a
-- harder season.
--
-- Draft, like the summers, and inert for the same reasons: the client's
-- season lookup filters to ('open','running'), and scored_catches needs a
-- season_entry besides.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The seasons.
--
-- Named "Winter 2026/27" because a winter season is not in one year, and
-- calling it "Winter 2026" would be ambiguous the moment it crosses January.
--
-- SCORING: every parameter here is copied from the summer seasons. They are
-- a starting point, not a judgement about winter fishing.
--
-- min_qualifying_oz is the one to look at. At 240 (15 lb) a winter season
-- applies the same qualifying weight as summer while counting fewer fish,
-- which may be exactly right, or may mean very little qualifies in the
-- months when carp barely feed. Scoring is computed on read, so changing it
-- is one call and re-scores the whole season instantly:
--
--   select public.retune_season_scoring(
--     (select id from seasons where name = 'Winter 2026/27'),
--     ...
--   );
--
-- Nothing needs backfilling, and nothing is locked in by seeding it now —
-- the alternative was leaving the column null, which scores nothing at all.
-- ---------------------------------------------------------------------------
insert into seasons (
  name, starts_on, ends_on, counting_fish,
  scoring_multiplier, scoring_offset_oz, scoring_exponent, min_qualifying_oz,
  pb_bonus_multiplier, named_fish_multiplier, status
)
select
  'Winter ' || y || '/' || right((y + 1)::text, 2),
  make_date(y, 10, 1),        -- 1 October
  make_date(y + 1, 3, 31),    -- 31 March
  3::smallint,                -- "5 summer, 3 winter"
  2.0, 240, 0.90, 240,        -- copied from summer; see note above
  1.05, 1.05,
  'draft'
from generate_series(2026, 2036) as y
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Divisions, on the same "any season without them" rule as the summers.
--
-- season_entries.division_id is NOT NULL, so a season with no divisions
-- cannot be entered by anyone.
-- ---------------------------------------------------------------------------
insert into divisions (season_id, name, rank, min_pb_oz, max_pb_oz)
select s.id, b.name, b.rank, b.min_pb_oz, b.max_pb_oz
from seasons s
cross join (values
  ('Division 1', 1::smallint, 640::integer, null::integer),  -- 40 lb and up
  ('Division 2', 2::smallint, 480::integer, 639::integer),   -- 30 lb - 39 lb 15 oz
  ('Division 3', 3::smallint, null::integer, 479::integer)   -- under 30 lb
) as b(name, rank, min_pb_oz, max_pb_oz)
where not exists (select 1 from divisions d where d.season_id = s.id)
on conflict (season_id, rank) do nothing;
