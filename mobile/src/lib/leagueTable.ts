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
  /** Null for anglers who aren't in the paid competition when this is a
   * divisional table — they're shown in their rightful place by points but
   * take no number, so a place in a cash-prize division always means a
   * paying angler. Always set in the national table, where everyone counts. */
  position: number | null;
  /** Not in the paid competition: either no season entry at all, or one on
   * the `open` tier. Rendered greyed out and unnumbered. */
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
  position_in_table: number | null;
  is_ghost: boolean;
  is_you: boolean;
}

/**
 * A league table, including rows for anglers who aren't in the paid
 * competition.
 *
 * Pass a divisionId for a single division's table, or null for the national
 * table. The position arithmetic happens in league_table_with_ghost() so it's
 * computed once, server-side.
 *
 * Divisional tables number only paying anglers: everyone else appears in
 * their rightful place on points but with a null position, so a place in a
 * cash-prize division always belongs to someone who can actually win it. The
 * national table numbers everyone, since it carries no prize.
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

  // Sorted on points, not position: unnumbered rows have no position to sort
  // by, and points is what the order actually means in both modes. The
  // reconstructed ghost arrives after the real rows, so this is what puts it
  // in place. Ghost first on an exact tie, matching how its position used to
  // be derived ("one more than everyone strictly ahead of it").
  return rows.sort((a, b) => b.points - a.points || Number(b.isGhost) - Number(a.isGhost));
}
