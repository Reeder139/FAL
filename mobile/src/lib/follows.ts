import { getPublicStorageUrl } from '@/lib/storage';
import { fetchBestVerifiedCatchOz, personalBest, type PersonalBest } from '@/lib/personalBest';
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

/** followee_ids the signed-in angler follows, as a Set for O(1) lookup —
 * fetched once per feed load and passed down to PostCard, rather than each
 * card querying its own follow state (N+1). */
export async function fetchFollowingIds(): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id);
  return new Set((data ?? []).map((f) => f.followee_id));
}

export interface AnglerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** The declaration made at onboarding. Kept for division context — use
   *  for anything the angler would call their PB. */
  declaredPbOz: number | null;
  /** Declaration vs. best verified catch, resolved. See lib/personalBest. */
  pb: PersonalBest;
  pbVerified: boolean;
  followerCount: number;
  followingCount: number;
  isSelf: boolean;
  isFollowing: boolean;
}

/** Profile + counts + relationship-to-viewer, for viewing another angler's
 * profile (or your own via the same screen — isSelf tells the UI to hide
 * the follow button). */
export async function fetchAnglerProfile(anglerId: string): Promise<AnglerProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: followRow }, bestVerifiedOz] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path, declared_pb_oz, pb_verified, follower_count, following_count')
      .eq('id', anglerId)
      .maybeSingle(),
    user && user.id !== anglerId
      ? supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('followee_id', anglerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // In parallel with the profile row: the displayed PB is the heavier of
    // the declaration and this, and declared_pb_oz alone goes stale the
    // moment someone lands a bigger fish.
    fetchBestVerifiedCatchOz(anglerId),
  ]);
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null,
    declaredPbOz: profile.declared_pb_oz,
    pb: personalBest(profile.declared_pb_oz, bestVerifiedOz),
    pbVerified: profile.pb_verified,
    followerCount: profile.follower_count,
    followingCount: profile.following_count,
    isSelf: user?.id === anglerId,
    isFollowing: !!followRow,
  };
}

export type FollowListKind = 'followers' | 'following';

export interface FollowListEntry {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** The people who follow `anglerId` (kind: 'followers'), or the people
 * `anglerId` follows (kind: 'following') — for the tap-through list from
 * the follower/following counts on a profile. */
export async function fetchFollowList(anglerId: string, kind: FollowListKind): Promise<FollowListEntry[]> {
  const column = kind === 'followers' ? 'follower_id' : 'followee_id';
  const filterColumn = kind === 'followers' ? 'followee_id' : 'follower_id';

  const { data: rows, error } = await supabase.from('follows').select(column).eq(filterColumn, anglerId);
  if (error) throw error;

  const ids = (rows ?? []).map((r) => (r as unknown as Record<string, string>)[column]);
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_path')
    .in('id', ids);
  if (profilesError) throw profilesError;

  return (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_path ? getPublicStorageUrl('post-media', p.avatar_path) : null,
  }));
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
