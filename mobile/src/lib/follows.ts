import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export async function followAngler(followeeId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to follow.');

  const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: followeeId });
  if (error) throw error;
}

export async function unfollowAngler(followeeId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to unfollow.');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

/** True if the signed-in angler has at least one season_entries row, ever
 * — used to decide whether the "My League" feed tab should show at all. */
export async function hasAnySeasonEntry(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from('season_entries')
    .select('id', { count: 'exact', head: true })
    .eq('angler_id', user.id);
  return (count ?? 0) > 0;
}

export interface SuggestedAngler {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  reason: 'division_leader' | 'recent_poster';
  divisionName: string | null;
}

/**
 * Fills the Following tab's empty state: division leaders first (a good,
 * recognizable follow), then most-recent posters to round out the list.
 * Excludes the caller and anyone already followed.
 */
export async function fetchSuggestedAnglers(limit = 12): Promise<SuggestedAngler[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: alreadyFollowing }, { data: season }] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', user.id),
    supabase.from('seasons').select('id').eq('status', 'running').limit(1).maybeSingle(),
  ]);

  const excludeIds = new Set<string>([user.id, ...(alreadyFollowing ?? []).map((f) => f.followee_id)]);
  const suggestions: SuggestedAngler[] = [];

  if (season) {
    const { data: divisions } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season.id)
      .order('rank');

    for (const division of divisions ?? []) {
      const { data: topRow } = await supabase
        .from('league_table')
        .select('angler_id')
        .eq('season_id', season.id)
        .eq('division_id', division.id)
        .eq('position', 1)
        .maybeSingle();
      if (!topRow || excludeIds.has(topRow.angler_id)) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_path')
        .eq('id', topRow.angler_id)
        .maybeSingle();
      if (!profile) continue;

      suggestions.push({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null,
        reason: 'division_leader',
        divisionName: division.name,
      });
      excludeIds.add(profile.id);
    }
  }

  if (suggestions.length < limit) {
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('author_id, created_at, profiles:author_id (id, username, display_name, avatar_path)')
      .order('created_at', { ascending: false })
      .limit(50);

    for (const post of recentPosts ?? []) {
      const profile = post.profiles as unknown as {
        id: string;
        username: string;
        display_name: string;
        avatar_path: string | null;
      } | null;
      if (!profile || excludeIds.has(profile.id)) continue;

      suggestions.push({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null,
        reason: 'recent_poster',
        divisionName: null,
      });
      excludeIds.add(profile.id);
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}
