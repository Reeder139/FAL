import { useCallback, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/** One side of the strip: where the angler stands in a competition. */
export interface LeagueStanding {
  /** Null when they have a score but no numbered place — a paid member who
   * has not caught anything inside their paid stint yet. */
  position: number | null;
  points: number;
  memberCount: number;
  /** Places gained since this time yesterday; positive is up the table.
   *
   * Null means "no comparison available", not "no movement": nothing was
   * recorded from before the cutoff, which is the case for anyone whose first
   * qualifying fish was today. The strip draws no arrow at all for null, and
   * none for zero either — an arrow that never moves stops being read. */
  delta: number | null;
  /** Set on the divisional side only. */
  divisionName: string | null;
}

export interface LeagueSummary {
  /** A `competitor` stint in the running season. Everyone else — `open` tier,
   * or no season_entries row at all — is a free member. */
  isPaidMember: boolean;
  /** False when no season is running, which is its own message rather than an
   * empty standing. */
  hasSeason: boolean;
  /** Their national placing. Null until they have a qualifying fish — every
   * angler is in that table, paid or free, so null here means no score yet
   * rather than not being a member. */
  national: LeagueStanding | null;
  /** Their divisional placing. Null for a free member, which is what turns
   * the right-hand side of the strip into the invitation to join. */
  division: LeagueStanding | null;
}

interface StandingRow {
  scope: string;
  position_in_table: number | null;
  total_points: number;
  member_count: number;
  division_name: string | null;
  delta: number | null;
}

/**
 * Both of the angler's standings, for the League Position strip.
 *
 * The positions, the member counts and the day-on-day deltas all come from
 * my_league_standing() in one call. Ranking a division is a rule, not an
 * arithmetic detail — paid entries only, by points — and it has to agree with
 * what league_table_with_ghost draws on the league page, so it stays in SQL
 * where that rule already lives.
 *
 * The old version of this asked hypothetical_league_position for a free
 * member's score, because free members were absent from the national table
 * entirely. They are in it now, so their standing is simply read like anyone
 * else's and the hypothetical path is gone.
 */
export async function fetchLeagueSummary(): Promise<LeagueSummary | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .in('status', ['open', 'running'])
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!season) {
    return { isPaidMember: false, hasSeason: false, national: null, division: null };
  }

  const [{ data: entry }, { data: rows }] = await Promise.all([
    supabase
      .from('season_entries')
      .select('tier, divisions(name)')
      .eq('season_id', season.id)
      .eq('angler_id', user.id)
      .is('left_at', null)
      .maybeSingle(),
    supabase.rpc('my_league_standing'),
  ]);

  const isPaidMember = entry?.tier === 'competitor';
  const standings = (rows ?? []) as StandingRow[];
  const toStanding = (row: StandingRow): LeagueStanding => ({
    position: row.position_in_table,
    points: row.total_points,
    memberCount: row.member_count,
    delta: row.delta,
    divisionName: row.division_name,
  });

  const nationalRow = standings.find((r) => r.scope === 'national');
  const divisionRow = standings.find((r) => r.scope === 'division');

  // A paid member with no qualifying fish inside their paid stint has no row
  // in division_league_table at all. They are still in that division, and
  // showing them the join prompt because they have not scored yet would be
  // selling them what they have already bought — so the side is built from
  // their entry instead, at zero.
  const entryDivision = (entry as { divisions?: { name: string } | null } | null)?.divisions?.name ?? null;
  const division: LeagueStanding | null = divisionRow
    ? toStanding(divisionRow)
    : isPaidMember
      ? { position: null, points: 0, memberCount: 0, delta: null, divisionName: entryDivision }
      : null;

  return {
    isPaidMember,
    hasSeason: true,
    national: nationalRow ? toStanding(nationalRow) : null,
    division,
  };
}

/**
 * One summary, shared by everything that reads it, and refetchable.
 *
 * It used to be fetch-on-mount with an empty dependency array, per component,
 * which broke the moment payment existed. Stripe returns the angler with a
 * full page load, the app fetches immediately, and the webhook — a separate
 * request from a separate machine — lands a moment later. So the summary
 * captured `isPaidMember: false` and never looked again: the tab layout stays
 * mounted while you move between tabs, so a member who had just paid kept
 * being sold to for the rest of the session.
 *
 * A module-level store rather than a context, because the two readers are the
 * tab layout and the strip inside it, and threading a provider through gains
 * nothing over this. It also collapses what were two independent fetches of
 * the same thing into one.
 */
let cached: LeagueSummary | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Refetch and notify every reader. Call this after anything that could
 * change membership — paying is the one that matters. */
export function refreshLeagueSummary(): Promise<void> {
  // Share an in-flight request rather than stacking them: several screens
  // can ask at once and the answer is the same for all of them.
  if (inflight) return inflight;
  inflight = fetchLeagueSummary()
    .then((data) => {
      cached = data;
    })
    .catch(() => {
      // Keep the last good value. Dropping to null on a flaky connection
      // would flash the upsell at a paying member, which is the exact
      // failure this whole change exists to stop.
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

export function useLeagueSummary(): LeagueSummary | null {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    if (cached === null && !inflight) void refreshLeagueSummary();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached
  );
}
