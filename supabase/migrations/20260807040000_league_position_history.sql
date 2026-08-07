-- ===========================================================================
-- Where everyone stood, so the app can say how they have moved.
--
-- The trend arrow on the League Position strip has been a hardcoded "▲3"
-- since it was built, with a TODO saying it needed standings history to diff
-- against. This is that history, and it also carries the "someone overtook
-- you" notifications, which are the same question asked at a different
-- interval.
--
-- Scoring is computed, never stored (see fal_points and the scored_catches
-- views), so there is nothing to hang a history off. Positions are recorded
-- explicitly instead, whenever a catch changes what they are.
--
-- Two readings of the same table, because the arrow and the notification want
-- different baselines:
--
--   arrow         current vs the last position recorded more than a day ago,
--                 i.e. "moved 3 places since yesterday". Stable enough to be
--                 worth reading.
--   notification  current vs the position immediately before this catch, so
--                 an overtake is reported when it happens rather than a day
--                 later.
--
-- Rows are written only when a position actually changes, so an angler's
-- standing at any moment is the last row at or before it. A season of a few
-- hundred anglers therefore costs a handful of rows per verified catch, not
-- one row per angler per catch.
-- ===========================================================================

create table if not exists league_position_history (
  id           bigint generated always as identity primary key,
  season_id    uuid not null references seasons(id) on delete cascade,
  angler_id    uuid not null references profiles(id) on delete cascade,
  -- 'national' is every angler with a qualifying fish; 'division' is the
  -- paid competition, where only competitor stints are numbered.
  scope        text not null check (scope in ('national', 'division')),
  division_id  uuid references divisions(id) on delete cascade,
  position     integer not null,
  total_points numeric not null,
  recorded_at  timestamptz not null default now()
);

-- The arrow's query: newest row for one angler and scope at or before a
-- cutoff. Descending, because every read of this table wants the latest.
create index if not exists league_position_history_angler_idx
  on league_position_history (angler_id, scope, recorded_at desc);
create index if not exists league_position_history_season_idx
  on league_position_history (season_id, scope, recorded_at desc);

alter table league_position_history enable row level security;

-- Readable by all, like every other standings surface — a position is public
-- the moment it appears in a league table. Written only by the recorder
-- below, which is security definer; there is deliberately no insert policy.
create policy "position history readable by all"
  on league_position_history for select using (true);

-- ---------------------------------------------------------------------------
-- The notifications. Their own table rather than derived on read: "X overtook
-- you" is true at a moment and stops being true the moment it changes again,
-- so it has to be captured when it happens.
-- ---------------------------------------------------------------------------
create table if not exists league_position_events (
  id              bigint generated always as identity primary key,
  -- Who is being told. Not who did it.
  angler_id       uuid not null references profiles(id) on delete cascade,
  season_id       uuid not null references seasons(id) on delete cascade,
  scope           text not null check (scope in ('national', 'division')),
  kind            text not null check (kind in ('moved_up', 'overtaken')),
  from_position   integer not null,
  to_position     integer not null,
  -- The angler who passed them, on an 'overtaken' row. Null when nobody in
  -- particular is responsible — a position can worsen because someone
  -- further down scored, without anyone passing this angler directly.
  other_angler_id uuid references profiles(id) on delete set null,
  occurred_at     timestamptz not null default now()
);

create index if not exists league_position_events_angler_idx
  on league_position_events (angler_id, occurred_at desc);

alter table league_position_events enable row level security;

-- Only yours. Unlike the history, this is a notification: it is addressed to
-- one angler and nobody else needs to read that they slipped a place.
create policy "own position events"
  on league_position_events for select using (auth.uid() = angler_id);
