import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface LeagueTableRow {
  anglerId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  divisionId: string;
  divisionName: string;
  divisionRank: number;
  points: number;
  countingFish: number;
  bestFishOz: number | null;
  position: number;
  /** A free member's projected row — not a real league entry. */
  isGhost: boolean;
  isYou: boolean;
}

interface RawRow {
  angler_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  division_id: string;
  division_name: string;
  division_rank: number;
  total_points: number;
  counting_fish: number;
  best_fish_oz: number | null;
  position_in_table: number;
  is_ghost: boolean;
  is_you: boolean;
}

/**
 * A league table plus, for free members, their own projected row.
 *
 * Pass a divisionId for a single division's table (positions ranked
 * in-division), or null for the national table (ranked across the season).
 * All of the ordering and position arithmetic — including where the ghost
 * slots in — happens in league_table_with_ghost() so it's computed once,
 * server-side.
 *
 * A ghost can legitimately share a position number with the real row below
 * it: real members are ranked among themselves and the ghost is inserted
 * without renumbering them.
 */
export async function fetchLeagueTableWithGhost(divisionId: string | null): Promise<LeagueTableRow[]> {
  const { data, error } = await supabase.rpc('league_table_with_ghost', {
    p_division_id: divisionId,
  });
  if (error) throw error;

  const rows: LeagueTableRow[] = ((data ?? []) as RawRow[]).map((row) => ({
    anglerId: row.angler_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path) : null,
    divisionId: row.division_id,
    divisionName: row.division_name,
    divisionRank: row.division_rank,
    points: row.total_points,
    countingFish: row.counting_fish,
    bestFishOz: row.best_fish_oz,
    position: row.position_in_table,
    isGhost: row.is_ghost,
    isYou: row.is_you,
  }));

  // The RPC returns real rows then the ghost; interleave by position so the
  // ghost lands in place. Ghost first on a tie, since its position is
  // "one more than everyone strictly ahead", so it outscores whoever it
  // shares a number with.
  return rows.sort((a, b) => a.position - b.position || Number(b.isGhost) - Number(a.isGhost));
}
