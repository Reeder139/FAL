import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface SuggestedFollowCard {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Null in fallback mode (recent posters — no standings context). */
  divisionName: string | null;
  divisionRank: number | null;
  positionInDivision: number | null;
  bestFishOz: number | null;
}

/** Backed entirely by the suggested_follows() RPC — ordering, division
 * top-7 selection, and the recent-posters fallback all happen in SQL, not
 * here. This just reshapes rows into the card-friendly camelCase/URL form. */
interface SuggestedFollowRow {
  suggested_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  division_name: string | null;
  division_rank: number | null;
  position_in_division: number | null;
  best_fish_oz: number | null;
}

export async function fetchSuggestedFollows(): Promise<SuggestedFollowCard[]> {
  const { data, error } = await supabase.rpc('suggested_follows');
  if (error) throw error;

  return ((data ?? []) as SuggestedFollowRow[]).map((row) => ({
    id: row.suggested_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path) : null,
    divisionName: row.division_name,
    divisionRank: row.division_rank,
    positionInDivision: row.position_in_division,
    bestFishOz: row.best_fish_oz,
  }));
}

export async function dismissSuggestion(anglerId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in.');

  const { error } = await supabase
    .from('follow_suggestion_dismissals')
    .insert({ user_id: user.id, suggested_id: anglerId });
  if (error) throw error;
}
