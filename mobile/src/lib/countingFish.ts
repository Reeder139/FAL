import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { fetchWitnessStatements, type WitnessStatement } from '@/lib/witness';

/** Which competition's counting fish to fetch. The two genuinely differ: a
 * divisional table counts only fish caught inside a paid stint, so the same
 * angler's top five can be a different five in each. */
export type CountingScope = 'national' | 'division';

export interface CountingFish {
  catchId: string;
  postId: string | null;
  photoUrl: string | null;
  weightOz: number;
  caughtAt: string;
  venueName: string | null;
  points: number;
  /** 1 = their best-scoring fish of the season. */
  rank: number;
  isPb: boolean;
  fishName: string | null;
  /** Who vouched for this fish, if anyone was asked. Null when no witness was
   * nominated — which is not a mark against the catch, only the absence of a
   * mark for it. */
  witness: WitnessStatement | null;
}

export interface CountingFishPage {
  anglerId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seasonName: string;
  scope: CountingScope;
  /** The season's cap — 5 in summer, 3 in winter. Stated so the page can say
   * "3 of 5 counting" when someone has not filled their card yet. */
  cap: number;
  fish: CountingFish[];
}

/**
 * The fish actually earning an angler their position, in scoring order.
 *
 * Reads the same views the tables score from — national_scored_catches or
 * division_scored_catches — rather than re-deriving "best n" here. The cap
 * and the ranking are season rules, and a second implementation of them in
 * TypeScript would be free to disagree with the standing it is explaining.
 *
 * Returns null when no season is running or the angler has nothing counting,
 * which the screen turns into its own message rather than an empty list.
 */
export async function fetchCountingFish(
  anglerId: string,
  scope: CountingScope
): Promise<CountingFishPage | null> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, counting_fish')
    .eq('status', 'running')
    .maybeSingle();
  if (!season) return null;

  const [{ data: profile }, { data: scored }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path')
      .eq('id', anglerId)
      .maybeSingle(),
    supabase
      .from(scope === 'division' ? 'division_scored_catches' : 'national_scored_catches')
      .select('catch_id, weight_oz, caught_at, points, rank_in_season')
      .eq('angler_id', anglerId)
      .eq('season_id', season.id)
      .lte('rank_in_season', season.counting_fish)
      .order('rank_in_season'),
  ]);
  if (!profile) return null;

  const base = {
    anglerId,
    username: profile.username as string,
    displayName: profile.display_name as string,
    avatarUrl: profile.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null,
    seasonName: season.name as string,
    scope,
    cap: season.counting_fish as number,
  };
  if (!scored || scored.length === 0) return { ...base, fish: [] };

  const catchIds = scored.map((s) => s.catch_id as string);
  const { data: catches } = await supabase
    .from('catches')
    .select('id, post_id, venue_id, is_pb, fish_name')
    .in('id', catchIds);

  const postIds = (catches ?? []).map((c) => c.post_id).filter((p): p is string => p !== null);
  const venueIds = (catches ?? []).map((c) => c.venue_id).filter((v): v is string => v !== null);

  const [{ data: media }, { data: venues }] = await Promise.all([
    postIds.length
      ? supabase.from('post_media').select('post_id, storage_path').in('post_id', postIds).eq('media_role', 'hero')
      : Promise.resolve({ data: [] as { post_id: string; storage_path: string }[] }),
    venueIds.length
      ? supabase.from('venues').select('id, name').in('id', venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const witnesses = await fetchWitnessStatements(catchIds);
  const catchById = new Map((catches ?? []).map((c) => [c.id as string, c]));
  const pathByPost = new Map((media ?? []).map((m) => [m.post_id, m.storage_path]));
  const venueById = new Map((venues ?? []).map((v) => [v.id, v.name]));

  return {
    ...base,
    fish: scored.map((s) => {
      const c = catchById.get(s.catch_id as string);
      const path = c?.post_id ? pathByPost.get(c.post_id) : undefined;
      return {
        catchId: s.catch_id as string,
        postId: (c?.post_id as string | null) ?? null,
        photoUrl: path ? getPublicStorageUrl('post-media', path) : null,
        weightOz: s.weight_oz as number,
        caughtAt: s.caught_at as string,
        venueName: c?.venue_id ? (venueById.get(c.venue_id) ?? null) : null,
        points: s.points as number,
        rank: s.rank_in_season as number,
        isPb: Boolean(c?.is_pb),
        fishName: (c?.fish_name as string | null) ?? null,
        witness: witnesses.get(s.catch_id as string) ?? null,
      };
    }),
  };
}
