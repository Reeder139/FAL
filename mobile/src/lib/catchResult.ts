import { supabase } from '@/lib/supabase';

export interface CatchResultData {
  isMember: boolean;
  points: number;
  seasonTotal: number;
  divisionName: string | null;
  /** Paid members only. */
  position: number | null;
  /** Free members only — null if the division has fewer than 20 members
   * (below that, percentages are noise, not signal — points-only instead). */
  percentile: number | null;
}

const BAND_THRESHOLDS = [5, 10, 20, 25, 33, 50, 75, 100];

/** "top 17%" -> "top 20%" — coarse bands read as a placement message, not a
 * suspiciously precise-looking stat. */
export function bandLabel(percentile: number): string {
  const topPercent = 100 - percentile;
  const band = BAND_THRESHOLDS.find((b) => topPercent <= b) ?? 100;
  return `top ${band}%`;
}

/**
 * Paid members (have a season_entries row) read straight from
 * scored_catches/league_table. Free members don't appear in those at all
 * (scored_catches inner-joins season_entries), so their preview comes from
 * hypothetical_catch_preview instead — see that function's comment in
 * fal_schema_v2.sql for how closely it mirrors the real scoring.
 */
export async function fetchCatchResult(catchId: string): Promise<CatchResultData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: scored } = await supabase
    .from('scored_catches')
    .select('points, season_id, division_id')
    .eq('catch_id', catchId)
    .maybeSingle();

  if (scored) {
    const [{ data: table }, { data: division }] = await Promise.all([
      supabase
        .from('league_table')
        .select('total_points, position')
        .eq('season_id', scored.season_id)
        .eq('division_id', scored.division_id)
        .eq('angler_id', user.id)
        .maybeSingle(),
      supabase.from('divisions').select('name').eq('id', scored.division_id).maybeSingle(),
    ]);

    return {
      isMember: true,
      points: scored.points,
      seasonTotal: table?.total_points ?? scored.points,
      divisionName: division?.name ?? null,
      position: table?.position ?? null,
      percentile: null,
    };
  }

  const { data: hypRows, error } = await supabase.rpc('hypothetical_catch_preview', { p_catch_id: catchId });
  if (error || !hypRows || hypRows.length === 0) return null;
  const hyp = hypRows[0];

  return {
    isMember: false,
    points: hyp.points,
    seasonTotal: hyp.hypothetical_season_total,
    divisionName: hyp.division_name,
    position: null,
    percentile: hyp.division_member_count >= 20 ? hyp.percentile : null,
  };
}
