import { fetchLikedPostIds } from '@/lib/likes';
import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export type PostKind = 'catch' | 'photo' | 'video' | 'announcement';
export type CatchStatus = 'pending' | 'verified' | 'under_review' | 'rejected';

/** Column-for-column match of the `feed_items` view (and the three feed_*
 * filter views built on it) — same names, same types. */
export interface FeedItem {
  post_id: string;
  author_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  kind: PostKind;
  caption: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  catch_id: string | null;
  weight_oz: number | null;
  species: string | null;
  fish_name: string | null;
  catch_status: CatchStatus | null;
  venue_name: string | null;
}

export interface FeedItemWithPhoto extends FeedItem {
  photo_url: string | null;
  /** Whether the signed-in angler has already liked this post. Resolved
   * here, one query per page, so a card never has to ask for itself. */
  liked_by_viewer: boolean;
}

export type FeedTab = 'following' | 'all' | 'league';

const FEED_VIEW_BY_TAB: Record<FeedTab, string> = {
  following: 'feed_following',
  all: 'feed_all',
  league: 'feed_league',
};

const PAGE_SIZE = 20;

export interface FeedPage {
  items: FeedItemWithPhoto[];
  /** created_at of the last row, to pass back in as `cursor` for the next
   * page — null once a page comes back short (no more rows). */
  nextCursor: string | null;
}

/**
 * Cursor pagination on created_at — never offset. Offset pagination
 * duplicates or skips rows once new posts land between page fetches, since
 * every row after the insert shifts down a position; a created_at cursor
 * doesn't have that problem because it's anchored to a value, not a
 * position in the list.
 */
export async function fetchFeedPage(tab: FeedTab, cursor: string | null): Promise<FeedPage> {
  let query = supabase
    .from(FEED_VIEW_BY_TAB[tab])
    .select('*')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return { items: [], nextCursor: null };

  const postIds = rows.map((r) => r.post_id);

  // Both in parallel: neither depends on the other, and the feed already
  // waits on the page query before either can start.
  const [{ data: media, error: mediaError }, likedPostIds] = await Promise.all([
    supabase.from('post_media').select('post_id, storage_path').in('post_id', postIds).eq('media_role', 'hero'),
    fetchLikedPostIds(postIds),
  ]);
  if (mediaError) throw mediaError;

  const heroPathByPost = new Map((media ?? []).map((m) => [m.post_id, m.storage_path]));

  const items: FeedItemWithPhoto[] = rows.map((row) => ({
    ...row,
    avatar_path: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path) : null,
    photo_url: heroPathByPost.has(row.post_id)
      ? getPublicStorageUrl('post-media', heroPathByPost.get(row.post_id)!)
      : null,
    liked_by_viewer: likedPostIds.has(row.post_id),
  }));

  return {
    items,
    nextCursor: rows.length === PAGE_SIZE ? items[items.length - 1].created_at : null,
  };
}
