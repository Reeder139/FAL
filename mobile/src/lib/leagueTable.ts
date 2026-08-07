import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface LeagueTableRow {
  anglerId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Null when no division covers the angler's declared PB. Only the "Div N"
   * badge depends on these, and the national standing isn't divided, so the
   * row still belongs in the table without them. */
  divisionId: string | null;
  divisionName: string | null;
  divisionRank: number | null;
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
  /** Hero photos of this angler's counting fish, heaviest-scoring first —
   * 0 to the season's `counting_fish`. Short by design: only catches that
   * were logged with a photo contribute one, so an angler with five
   * counting fish and two photos gets two. */
  countingFishPhotos: string[];
}

interface RawRow {
  angler_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  division_id: string | null;
  division_name: string | null;
  division_rank: number | null;
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
    countingFishPhotos: [],
  }));

  await attachCountingFishPhotos(rows, divisionId !== null);

  // Sorted on points, not position: unnumbered rows have no position to sort
  // by, and points is what the order actually means in both modes. The
  // reconstructed ghost arrives after the real rows, so this is what puts it
  // in place. Ghost first on an exact tie, matching how its position used to
  // be derived ("one more than everyone strictly ahead of it").
  return rows.sort((a, b) => b.points - a.points || Number(b.isGhost) - Number(a.isGhost));
}

/** Postgrest puts the `in` list in the query string, so a table the size of
 * a full national league would build a URL long enough to be rejected.
 * Split and rejoin. */
const IN_CHUNK = 60;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectIn<T>(
  table: string,
  columns: string,
  column: string,
  values: string[],
  refine?: (q: any) => any
): Promise<T[]> {
  const pages = await Promise.all(
    chunk(values, IN_CHUNK).map(async (slice) => {
      let query = supabase.from(table).select(columns).in(column, slice);
      if (refine) query = refine(query);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as T[];
    })
  );
  return pages.flat();
}

/**
 * Fills in `countingFishPhotos` for every row, in three batched queries
 * rather than per-row — a national table is 50+ anglers and an N+1 here
 * would be 50+ round trips on every load.
 *
 * The chain is scored_catches -> catches -> post_media, because
 * scored_catches carries the rank that decides which fish are counting but
 * not the post the photo hangs off, and there's no direct join from a catch
 * to its media (both reference the post, not each other).
 */
/**
 * @param divisionScope true for a divisional table, where only fish caught
 *   inside a paid stint count. The two tables legitimately show different
 *   fish for the same angler, so the thumbnails have to come from whichever
 *   ranking the row's points were taken from — otherwise the strip shows
 *   fish that did not earn the position beside it.
 */
async function attachCountingFishPhotos(
  rows: LeagueTableRow[],
  divisionScope: boolean
): Promise<void> {
  for (const row of rows) row.countingFishPhotos = [];
  if (rows.length === 0) return;

  // The cap comes from the season, not a constant: counting_fish is one of
  // the tunables that re-scores every leaderboard when it changes.
  const { data: season } = await supabase
    .from('seasons')
    .select('id, counting_fish')
    .eq('status', 'running')
    .maybeSingle();
  const cap = season?.counting_fish;
  if (!season || !cap) return;

  const anglerIds = [...new Set(rows.map((r) => r.anglerId))];
  const scored = await selectIn<{ catch_id: string; angler_id: string; rank_in_season: number }>(
    // national_scored_catches, not scored_catches: the latter inner-joins
    // season_entries, so a free member has no rows in it and their national
    // row came back with an empty fish strip.
    divisionScope ? 'division_scored_catches' : 'national_scored_catches',
    'catch_id, angler_id, rank_in_season',
    'angler_id',
    anglerIds,
    // rank_in_season is numbered per angler *per season*, so without pinning
    // the season a past season's top five matches `rank <= cap` just as well
    // as this one's and its photos end up on the strip.
    (q) => q.eq('season_id', season.id).lte('rank_in_season', cap)
  );
  if (scored.length === 0) return;

  const catches = await selectIn<{ id: string; post_id: string }>(
    'catches',
    'id, post_id',
    'id',
    scored.map((s) => s.catch_id)
  );
  const postIdByCatch = new Map(catches.map((c) => [c.id, c.post_id]));

  const media = await selectIn<{ post_id: string; storage_path: string }>(
    'post_media',
    'post_id, storage_path',
    'post_id',
    [...new Set(catches.map((c) => c.post_id))],
    (q) => q.eq('media_role', 'hero')
  );
  const pathByPost = new Map(media.map((m) => [m.post_id, m.storage_path]));

  // Best-scoring first, so the strip reads in the same order as the fish
  // that earned the position.
  const byAngler = new Map<string, string[]>();
  for (const s of [...scored].sort((a, b) => a.rank_in_season - b.rank_in_season)) {
    const postId = postIdByCatch.get(s.catch_id);
    const path = postId ? pathByPost.get(postId) : undefined;
    if (!path) continue;
    const list = byAngler.get(s.angler_id) ?? [];
    list.push(getPublicStorageUrl('post-media', path));
    byAngler.set(s.angler_id, list);
  }

  for (const row of rows) row.countingFishPhotos = byAngler.get(row.anglerId) ?? [];
}
