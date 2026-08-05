import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface AnglerCatch {
  id: string;
  postId: string;
  weightOz: number;
  caughtAt: string;
  /** Null when the catch has no venue, or when it's venue-hidden and the
   * viewer isn't the angler themselves. */
  venueName: string | null;
  /** Null when the catch has no hero image — the grid falls back to a
   * plain tile rather than dropping the catch. */
  photoUrl: string | null;
  status: string;
}

/**
 * Every catch by one angler, newest first, for the grid on their profile.
 *
 * Reads `catches` directly rather than the feed_items view: feed_items is
 * keyed on the post and exposes posts.created_at (when it was logged),
 * whereas a catch grid wants caught_at (when the fish was actually
 * caught), and feed_items nulls venue_name unconditionally for
 * venue-hidden catches — which is right for the public feed but wrong
 * when you're looking at your own profile, since "hide venue" is about
 * hiding it from other people.
 */
export async function fetchAnglerCatches(anglerId: string): Promise<AnglerCatch[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === anglerId;

  // The inner join on posts is what keeps deleted catches out of the grid.
  // `catches` has no deleted_at of its own — deletion lives on the post — so
  // querying catches alone returns them, and they render as a tile with a
  // weight and no image: post_media's select policy hides media whose post is
  // deleted, so the photo goes and the row doesn't.
  const { data: rows, error } = await supabase
    .from('catches')
    .select('id, post_id, weight_oz, caught_at, venue_id, venue_hidden, status, posts!inner(deleted_at)')
    .eq('angler_id', anglerId)
    .is('posts.deleted_at', null)
    .order('caught_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const postIds = rows.map((r) => r.post_id);
  const venueIds = [...new Set(rows.map((r) => r.venue_id).filter((v): v is string => v !== null))];

  const [{ data: media }, { data: venues }] = await Promise.all([
    supabase.from('post_media').select('post_id, storage_path').in('post_id', postIds).eq('media_role', 'hero'),
    venueIds.length > 0
      ? supabase.from('venues').select('id, name').in('id', venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const heroByPost = new Map((media ?? []).map((m) => [m.post_id, m.storage_path]));
  const venueById = new Map((venues ?? []).map((v) => [v.id, v.name]));

  return rows.map((row) => {
    const heroPath = heroByPost.get(row.post_id);
    const showVenue = !row.venue_hidden || isOwnProfile;
    return {
      id: row.id,
      postId: row.post_id,
      weightOz: row.weight_oz,
      caughtAt: row.caught_at,
      venueName: showVenue && row.venue_id ? (venueById.get(row.venue_id) ?? null) : null,
      photoUrl: heroPath ? getPublicStorageUrl('post-media', heroPath) : null,
      status: row.status,
    };
  });
}
