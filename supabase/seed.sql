-- ============================================================================
-- Real competition data — a live season plus its three divisions.
--
-- Division PB ranges and the season length (Apr-Sep) mirror the existing
-- "Summer 2027" draft season and the original app mockups: Division 1 is
-- the hardest (40lb+), Division 3 the easiest (under 30lb). Scoring
-- parameters are left at the seasons table's own defaults, matching that
-- draft season too.
--
-- This file is only auto-applied by `supabase db reset` against a local
-- dev database (see supabase/config.toml's db.seed.sql_paths). Against the
-- hosted project it has to be run directly — there's no local Postgres
-- available in this environment (Docker) to do a real db reset against.
-- ============================================================================

insert into seasons (id, name, starts_on, ends_on, counting_fish, status)
values (
  '11111111-0000-0000-0000-000000000001',
  'Summer 2026',
  '2026-04-01',
  '2026-09-30',
  5,
  'running'
)
on conflict (id) do nothing;

insert into divisions (season_id, name, rank, min_pb_oz, max_pb_oz)
values
  ('11111111-0000-0000-0000-000000000001', 'Division 1', 1, 640, null),  -- 40lb+
  ('11111111-0000-0000-0000-000000000001', 'Division 2', 2, 480, 639),   -- 30-40lb
  ('11111111-0000-0000-0000-000000000001', 'Division 3', 3, null, 479)   -- under 30lb
on conflict (season_id, rank) do nothing;
