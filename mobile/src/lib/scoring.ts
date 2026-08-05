import { supabase } from '@/lib/supabase';

export interface SeasonScoring {
  id: string;
  scoring_multiplier: number;
  scoring_offset_oz: number;
  scoring_exponent: number;
  min_qualifying_oz: number;
}

/**
 * Why a catch dated `caughtAt` would or wouldn't score.
 *
 * `none` and `error` are kept apart deliberately. Both used to arrive as a
 * null season, which meant a lookup that failed on a flaky connection looked
 * exactly like a date outside every season — so the screen could say nothing
 * useful about either. Only `none` is a fact about the catch; `error` is a
 * fact about the network, and must never be reported to the angler as a
 * problem with their fish.
 */
export type SeasonLookup =
  | { state: 'found'; season: SeasonScoring; seasonName: string }
  | { state: 'none' }
  | { state: 'error' };

/** The season covering `caughtAt`, open or running. */
export async function fetchSeasonForDate(caughtAt: Date): Promise<SeasonLookup> {
  const dateStr = caughtAt.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, scoring_multiplier, scoring_offset_oz, scoring_exponent, min_qualifying_oz')
    .in('status', ['open', 'running'])
    .lte('starts_on', dateStr)
    .gte('ends_on', dateStr)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { state: 'error' };
  if (!data) return { state: 'none' };

  const { name, ...season } = data;
  return { state: 'found', season, seasonName: name };
}

/**
 * Mirrors fal_points() in fal_schema_v2.sql exactly — this is a live,
 * type-as-you-go preview, so it runs in JS rather than round-tripping to
 * Postgres per keystroke. The season's tunable numbers (multiplier/offset/
 * exponent/min_qualifying) are always fetched live via fetchSeasonForDate,
 * never hardcoded — only the formula shape is duplicated here, and it must
 * stay in sync with fal_points() if that ever changes.
 *
 * Deliberately doesn't apply the pb_bonus_multiplier or
 * named_fish_multiplier: this screen doesn't collect a fish name, and
 * whether a catch is a new PB is a fact determined by submit_catch itself
 * (comparing against the angler's real catch history), not knowable from
 * form state alone. The post-submit result card shows the true final
 * points including both.
 */
export function computePoints(weightOz: number, season: SeasonScoring): number {
  if (weightOz < season.min_qualifying_oz) return 0;
  const points =
    season.scoring_multiplier * Math.pow((weightOz - season.scoring_offset_oz) / 16, season.scoring_exponent);
  return Math.round(points * 100) / 100;
}
