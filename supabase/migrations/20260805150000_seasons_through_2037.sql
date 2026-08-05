-- ===========================================================================
-- Ten more summer seasons, and the divisions they need to be usable.
--
-- Summer 2026 is running and Summer 2027 existed as a draft. This adds
-- Summer 2028 through Summer 2037, so the calendar is laid out a decade
-- ahead rather than being remembered each spring.
--
-- All ten are `draft` on purpose. Nothing reads a draft season: the client's
-- season lookup filters to ('open','running') and bounds by today's date, the
-- divisions screens do the same, and scored_catches only counts a catch when
-- its angler holds a season_entry. So these rows are inert until someone
-- deliberately opens one, and cannot pull a catch out of the running season.
-- The existing seasons_one_running unique index is the backstop for the same
-- thing at the other end.
--
-- Seeded here rather than through create_season() because that function
-- exists to gate and audit *the console*, and takes only name and dates — no
-- scoring parameters, and no divisions. A migration is already a reviewed,
-- version-controlled record of a change, which is what the audit row is for.
-- The "always call the function" rule in the Retool doc is about the console,
-- not about migrations.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One season per name.
--
-- There was no unique key on seasons at all, so nothing stopped a second
-- "Summer 2029" being created — and two overlapping seasons is not a
-- cosmetic problem: fetchSeasonForDate() picks one with `limit 1`, so a
-- catch's points preview would depend on which row sorted first. It also
-- makes the insert below safely re-runnable.
--
-- Checked against the live data before adding: no duplicate names exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seasons_name_key') then
    alter table seasons add constraint seasons_name_key unique (name);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The seasons.
--
-- Scoring parameters are copied from Summer 2026 rather than invented. They
-- are a starting point, not a decision — scoring is computed on read, so
-- retune_season_scoring() changes any of these later and re-scores that
-- season's whole leaderboard instantly, with no backfill. Setting them now
-- only avoids a season that scores nothing because a column was left null.
-- ---------------------------------------------------------------------------
insert into seasons (
  name, starts_on, ends_on, counting_fish,
  scoring_multiplier, scoring_offset_oz, scoring_exponent, min_qualifying_oz,
  pb_bonus_multiplier, named_fish_multiplier, status
)
select
  'Summer ' || y,
  make_date(y, 4, 1),     -- 1 April
  make_date(y, 9, 30),    -- 30 September
  5::smallint,            -- counting fish, as per Summer 2026
  2.0, 240, 0.90, 240,    -- multiplier, offset (15 lb), exponent, qualifying (15 lb)
  1.05, 1.05,             -- PB bonus, named fish
  'draft'
from generate_series(2028, 2037) as y
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Divisions.
--
-- season_entries.division_id is NOT NULL and references divisions, so a
-- season without them cannot be entered at all — the league would simply
-- refuse to start. Summer 2027 already had this problem and is fixed here
-- too, which is why this is keyed off "has no divisions" rather than off the
-- seasons inserted above.
--
-- The bands mirror Summer 2026 exactly: 1 is the hardest, and an unproven PB
-- seeds into it. Proving a *low* PB is what buys an easier division, which is
-- the anti-sandbagging design, not an oversight.
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
