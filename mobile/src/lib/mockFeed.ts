/**
 * Mock feed data, shaped to match the `feed_items` view in fal_schema_v2.sql
 * column-for-column. Swapping to the real thing later should only mean
 * rewriting the body of `getFeedItems()` — everything downstream (PostCard,
 * the feed screen) reads `FeedItemWithPhoto` and shouldn't need to change.
 *
 * Real swap-in:
 *   const { data, error } = await supabase
 *     .from('feed_items')
 *     .select('*, post_media(storage_path, sort_order)')
 *     .order('created_at', { ascending: false });
 *
 * Note: `feed_items` itself has no photo column — post images live in
 * `post_media`, a separate 1:many table keyed on post_id (see
 * fal_schema_v2.sql section 3). `photo_url` below stands in for that join.
 * `avatar_path`/`photo_url` are storage paths in production, resolved via
 * supabase.storage.from(...).getPublicUrl() — this mock uses direct URLs so
 * the screen renders something without wiring up Storage yet.
 */

export type PostKind = 'catch' | 'photo' | 'video' | 'announcement';
export type CatchStatus = 'pending' | 'verified' | 'under_review' | 'rejected';

/** Column-for-column match of the `feed_items` view — same names, same types. */
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

/** feed_items + the post_media join the real query will add. */
export interface FeedItemWithPhoto extends FeedItem {
  photo_url: string | null;
}

export const mockFeedItems: FeedItemWithPhoto[] = [
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a01',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000001',
    username: 'leew',
    display_name: 'Lee W.',
    avatar_path: 'https://i.pravatar.cc/150?img=12',
    kind: 'catch',
    caption: 'Stunning mirror from the island swim using the FAL Honey Nut pop-up.',
    like_count: 128,
    comment_count: 14,
    created_at: '2026-07-30T05:15:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000001',
    weight_oz: 516,
    species: 'mirror carp',
    fish_name: 'The Bullet',
    catch_status: 'verified',
    venue_name: 'Bluebell Wood Lake',
    photo_url: 'https://picsum.photos/seed/fal-catch-1/900/900',
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a02',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000002',
    username: 'toms',
    display_name: 'Tom S.',
    avatar_path: 'https://i.pravatar.cc/150?img=33',
    kind: 'catch',
    caption: 'First proper session at Yateley this season, buzzed off this one.',
    like_count: 96,
    comment_count: 9,
    created_at: '2026-07-29T18:42:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000002',
    weight_oz: 393,
    species: 'common carp',
    fish_name: null,
    catch_status: 'verified',
    venue_name: 'Yateley Complex',
    photo_url: 'https://picsum.photos/seed/fal-catch-2/900/900',
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a03',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000003',
    username: 'alexr',
    display_name: 'Alex R.',
    avatar_path: 'https://i.pravatar.cc/150?img=68',
    kind: 'photo',
    caption: 'Sunrise over the swim this morning, worth the early alarm.',
    like_count: 41,
    comment_count: 3,
    created_at: '2026-07-29T05:03:00.000Z',
    catch_id: null,
    weight_oz: null,
    species: null,
    fish_name: null,
    catch_status: null,
    venue_name: null,
    photo_url: 'https://picsum.photos/seed/fal-photo-3/900/900',
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a04',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000004',
    username: 'joshh',
    display_name: 'Josh H.',
    avatar_path: 'https://i.pravatar.cc/150?img=51',
    kind: 'catch',
    caption: 'Under review while we confirm the weigh-in photos — will update!',
    like_count: 22,
    comment_count: 6,
    created_at: '2026-07-28T14:20:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000004',
    weight_oz: 610,
    species: 'common carp',
    fish_name: 'Old Leather',
    catch_status: 'under_review',
    venue_name: 'Linear Fisheries',
    photo_url: 'https://picsum.photos/seed/fal-catch-4/900/900',
  },
];

export async function getFeedItems(): Promise<FeedItemWithPhoto[]> {
  return mockFeedItems;
}
