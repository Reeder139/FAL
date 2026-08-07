import type { LeagueTableRow } from '@/lib/leagueTable';

/**
 * How many anglers the national table shows.
 *
 * A leaderboard, not a directory: past the top 50 the standing stops being
 * something anyone reads and becomes a very long list.
 */
export const NATIONAL_TABLE_LIMIT = 50;

export interface VisibleRows {
  /** The rows to render, in order. */
  shown: LeagueTableRow[];
  /** True when rows were cut, so the table can say it is showing a top 50. */
  capped: boolean;
  /** The reader's own row, when the cap left it out of `shown`. The table
   * pins this underneath the list — being 63rd is a worse reason to vanish
   * from your own league than being unpaid ever was. */
  youBelowCap: LeagueTableRow | null;
}

/**
 * Decides which rows a league table draws.
 *
 * Divisions are deliberately never capped. Those are the cash-prize tables,
 * and hiding a paying angler from the standing they are competing in would be
 * a good deal worse than a long scroll.
 *
 * The cap is applied here, at render, rather than as a `limit` in the query.
 * The rows are cheap at this scale, and having the whole table on hand is
 * exactly what lets an angler below the cap still be shown their real
 * position — which a truncated query could not do.
 *
 * Its own module, free of imports, so it can be exercised directly. The
 * behaviour it encodes only shows up past 50 anglers, which is well beyond
 * anything the app can be made to render by hand today.
 */
export function selectVisibleRows(
  rows: LeagueTableRow[],
  divisionId: string | null
): VisibleRows {
  if (divisionId !== null || rows.length <= NATIONAL_TABLE_LIMIT) {
    return { shown: rows, capped: false, youBelowCap: null };
  }

  const shown = rows.slice(0, NATIONAL_TABLE_LIMIT);
  const you = rows.find((r) => r.isYou) ?? null;
  return {
    shown,
    capped: true,
    youBelowCap: you !== null && !shown.includes(you) ? you : null,
  };
}
