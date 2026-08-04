import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface AnglerSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing: boolean;
  /** How close the match is, 0–1. Not shown to the angler — kept because
   * the list's order is only meaningful alongside it when debugging why a
   * result ranked where it did. */
  matchScore: number;
}

interface SearchAnglersRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  is_following: boolean;
  match_score: number;
}

/**
 * Member search for the feed's search dialog, ranked nearest-first.
 *
 * The ranking lives in the search_anglers RPC rather than here: matching a
 * typo against every member is a set operation over a trigram index, not
 * something to do by pulling profiles down and scoring them on the phone.
 * See the migration for how the score is built.
 *
 * Returns [] for a query under two characters — a single letter matches most
 * of the membership and the list is noise rather than an answer.
 */
export async function searchAnglers(query: string, limit = 20): Promise<AnglerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabase.rpc('search_anglers', { p_query: trimmed, p_limit: limit });
  if (error) throw error;

  return ((data ?? []) as SearchAnglersRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    // profiles.display_name is not null, so this fallback should never
    // fire — it's here because the RPC's return type can't express that,
    // and a nameless row is a worse failure than showing the handle twice.
    displayName: row.display_name ?? row.username,
    avatarUrl: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path) : null,
    isFollowing: row.is_following,
    matchScore: row.match_score,
  }));
}
