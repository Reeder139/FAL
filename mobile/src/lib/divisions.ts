import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface DivisionOverview {
  id: string;
  name: string;
  rank: number;
  minPbOz: number | null;
  maxPbOz: number | null;
  memberCount: number;
  /** Highest league_table total_points in this division — null if nobody
   * has a scored catch yet. */
  topScore: number | null;
  isYourDivision: boolean;
}

export interface LeagueOverview {
  seasonName: string;
  /** declared_pb_oz vs. best verified catch, whichever is higher — the PB
   * grows automatically as an angler lands bigger verified fish, it isn't
   * fixed at whatever was declared during onboarding. Null if neither
   * exists. */
  currentPbOz: number | null;
  /** Which of this season's divisions currentPbOz would seed into — used
   * as the reseed preview. There's only ever one season's division
   * structure to reference (no "next season" object exists yet), so this
   * uses the current one as a proxy; division PB ranges aren't expected to
   * change season to season. */
  nextDivisionName: string | null;
  divisions: DivisionOverview[];
}

/** "40lb+" / "30-40lb" / "Under 30lb" from a division's oz range. */
export function formatPbRange(minPbOz: number | null, maxPbOz: number | null): string {
  if (minPbOz !== null && maxPbOz === null) return `${Math.floor(minPbOz / 16)}lb+`;
  if (minPbOz === null && maxPbOz !== null) return `Under ${Math.ceil((maxPbOz + 1) / 16)}lb`;
  if (minPbOz !== null && maxPbOz !== null) {
    return `${Math.floor(minPbOz / 16)}–${Math.ceil((maxPbOz + 1) / 16)}lb`;
  }
  return 'All weights';
}

function findDivisionForPb<T extends { minPbOz: number | null; maxPbOz: number | null }>(
  pbOz: number | null,
  divisions: T[]
): T | null {
  if (pbOz === null) return null;
  return (
    divisions.find(
      (d) => (d.minPbOz === null || pbOz >= d.minPbOz) && (d.maxPbOz === null || pbOz <= d.maxPbOz)
    ) ?? null
  );
}

/**
 * Note: this deliberately doesn't include "Promotion Spots" or "Winner
 * Prize" from the reference render — there's no prize pool or promotion
 * rule system in the schema yet, and inventing numbers for either would be
 * exactly the kind of fabricated data this app avoids everywhere else.
 */
export async function fetchLeagueOverview(): Promise<LeagueOverview | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .in('status', ['open', 'running'])
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;

  const [{ data: profile }, { data: bestCatch }, { data: divisionsRaw }] = await Promise.all([
    supabase.from('profiles').select('declared_pb_oz').eq('id', user.id).maybeSingle(),
    // Same "best verified catch" comparison submit_catch uses to decide is_pb.
    supabase
      .from('catches')
      .select('weight_oz')
      .eq('angler_id', user.id)
      .eq('status', 'verified')
      .order('weight_oz', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('divisions')
      .select('id, name, rank, min_pb_oz, max_pb_oz')
      .eq('season_id', season.id)
      .order('rank'),
  ]);

  const declaredPbOz = profile?.declared_pb_oz ?? null;
  const bestVerifiedOz = bestCatch?.weight_oz ?? null;
  const currentPbOz =
    declaredPbOz === null && bestVerifiedOz === null
      ? null
      : Math.max(declaredPbOz ?? 0, bestVerifiedOz ?? 0);

  const divisions = await Promise.all(
    (divisionsRaw ?? []).map(async (d): Promise<DivisionOverview> => {
      const [{ count }, { data: topRow }] = await Promise.all([
        supabase
          .from('season_entries')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .eq('division_id', d.id),
        supabase
          .from('league_table')
          .select('total_points')
          .eq('season_id', season.id)
          .eq('division_id', d.id)
          .order('total_points', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const isYourDivision =
        currentPbOz !== null &&
        (d.min_pb_oz === null || currentPbOz >= d.min_pb_oz) &&
        (d.max_pb_oz === null || currentPbOz <= d.max_pb_oz);

      return {
        id: d.id,
        name: d.name,
        rank: d.rank,
        minPbOz: d.min_pb_oz,
        maxPbOz: d.max_pb_oz,
        memberCount: count ?? 0,
        topScore: topRow?.total_points ?? null,
        isYourDivision,
      };
    })
  );

  const nextDivision = findDivisionForPb(
    currentPbOz,
    divisions.map((d) => ({ minPbOz: d.minPbOz, maxPbOz: d.maxPbOz, name: d.name }))
  );

  return {
    seasonName: season.name,
    currentPbOz,
    nextDivisionName: nextDivision?.name ?? null,
    divisions,
  };
}

export interface DivisionLeader {
  anglerId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  identityVerified: boolean;
  /** Venue of the leader's top-scoring fish this season — null if it has no venue on file. */
  venueName: string | null;
  points: number;
  countingFish: number;
  avgWeightOz: number | null;
  /** declared_pb_oz vs. best verified catch, whichever is higher — same "current PB" definition used elsewhere. */
  pbOz: number | null;
}

export interface DivisionLeaderRow {
  id: string;
  name: string;
  rank: number;
  minPbOz: number | null;
  maxPbOz: number | null;
  memberCount: number;
  /** Null if nobody in this division has a qualifying (verified, in-period) catch yet. */
  leader: DivisionLeader | null;
}

export interface DivisionLeadersOverview {
  seasonName: string;
  divisions: DivisionLeaderRow[];
}

/**
 * Per-division top-of-the-table angler, for the "Division Leaders" screen.
 * Mirrors fetchLeagueOverview's season/division lookup, then fans out one
 * leader lookup per division (there are only ever 3) rather than adding a
 * bespoke SQL view for a single read-only screen.
 */
export async function fetchDivisionLeaders(): Promise<DivisionLeadersOverview | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .in('status', ['open', 'running'])
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;

  const { data: divisionsRaw } = await supabase
    .from('divisions')
    .select('id, name, rank, min_pb_oz, max_pb_oz')
    .eq('season_id', season.id)
    .order('rank');

  const divisions = await Promise.all(
    (divisionsRaw ?? []).map(async (d): Promise<DivisionLeaderRow> => {
      const [{ count }, { data: topRow }] = await Promise.all([
        supabase
          .from('season_entries')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .eq('division_id', d.id),
        supabase
          .from('league_table')
          .select('angler_id, total_points, counting_fish')
          .eq('season_id', season.id)
          .eq('division_id', d.id)
          .eq('position', 1)
          .maybeSingle(),
      ]);

      if (!topRow) {
        return {
          id: d.id,
          name: d.name,
          rank: d.rank,
          minPbOz: d.min_pb_oz,
          maxPbOz: d.max_pb_oz,
          memberCount: count ?? 0,
          leader: null,
        };
      }

      const [{ data: profile }, { data: topScoredCatch }, { data: bestVerified }, { data: countingCatches }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('username, display_name, avatar_path, identity_verified, declared_pb_oz')
            .eq('id', topRow.angler_id)
            .maybeSingle(),
          supabase
            .from('scored_catches')
            .select('catch_id')
            .eq('season_id', season.id)
            .eq('angler_id', topRow.angler_id)
            .eq('rank_in_season', 1)
            .maybeSingle(),
          supabase
            .from('catches')
            .select('weight_oz')
            .eq('angler_id', topRow.angler_id)
            .eq('status', 'verified')
            .order('weight_oz', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('scored_catches')
            .select('weight_oz')
            .eq('season_id', season.id)
            .eq('angler_id', topRow.angler_id)
            .lte('rank_in_season', topRow.counting_fish),
        ]);

      const avgWeightOz =
        countingCatches && countingCatches.length > 0
          ? Math.round(countingCatches.reduce((sum, c) => sum + c.weight_oz, 0) / countingCatches.length)
          : null;

      let venueName: string | null = null;
      if (topScoredCatch) {
        const { data: catchRow } = await supabase
          .from('catches')
          .select('venue_id')
          .eq('id', topScoredCatch.catch_id)
          .maybeSingle();
        if (catchRow?.venue_id) {
          const { data: venue } = await supabase
            .from('venues')
            .select('name')
            .eq('id', catchRow.venue_id)
            .maybeSingle();
          venueName = venue?.name ?? null;
        }
      }

      const declaredPbOz = profile?.declared_pb_oz ?? null;
      const bestVerifiedOz = bestVerified?.weight_oz ?? null;
      const pbOz =
        declaredPbOz === null && bestVerifiedOz === null ? null : Math.max(declaredPbOz ?? 0, bestVerifiedOz ?? 0);

      return {
        id: d.id,
        name: d.name,
        rank: d.rank,
        minPbOz: d.min_pb_oz,
        maxPbOz: d.max_pb_oz,
        memberCount: count ?? 0,
        leader: {
          anglerId: topRow.angler_id,
          displayName: profile?.display_name ?? '—',
          username: profile?.username ?? '',
          avatarUrl: profile?.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null,
          identityVerified: profile?.identity_verified ?? false,
          venueName,
          points: topRow.total_points,
          countingFish: topRow.counting_fish,
          avgWeightOz,
          pbOz,
        },
      };
    })
  );

  return { seasonName: season.name, divisions };
}
