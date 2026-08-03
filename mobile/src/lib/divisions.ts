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
  yourDeclaredPbOz: number | null;
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

  const [{ data: profile }, { data: divisionsRaw }] = await Promise.all([
    supabase.from('profiles').select('declared_pb_oz').eq('id', user.id).maybeSingle(),
    supabase
      .from('divisions')
      .select('id, name, rank, min_pb_oz, max_pb_oz')
      .eq('season_id', season.id)
      .order('rank'),
  ]);

  const declaredPbOz = profile?.declared_pb_oz ?? null;

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
        declaredPbOz !== null &&
        (d.min_pb_oz === null || declaredPbOz >= d.min_pb_oz) &&
        (d.max_pb_oz === null || declaredPbOz <= d.max_pb_oz);

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

  return { seasonName: season.name, yourDeclaredPbOz: declaredPbOz, divisions };
}
