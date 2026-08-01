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
 *
 * Photos are real files uploaded to the (public) `post-media` Storage
 * bucket, resolved via `getPublicStorageUrl()` — this is the actual
 * production resolution path, not a placeholder. Avatars are still stock
 * placeholder headshots (`i.pravatar.cc`) since no profile photos have been
 * uploaded yet; in production `avatar_path` resolves the same way as the
 * post photos do.
 */

import { getPublicStorageUrl } from '@/lib/storage';

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

const postMediaPhoto = (filename: string) => getPublicStorageUrl('post-media', filename);

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
    created_at: '2026-07-31T05:15:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000001',
    weight_oz: 516,
    species: 'mirror carp',
    fish_name: 'The Bullet',
    catch_status: 'verified',
    venue_name: 'Bluebell Wood Lake',
    photo_url: postMediaPhoto('0S1A6279.jpg'),
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
    created_at: '2026-07-30T18:42:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000002',
    weight_oz: 393,
    species: 'common carp',
    fish_name: null,
    catch_status: 'verified',
    venue_name: 'Yateley Complex',
    photo_url: postMediaPhoto('0S1A6325.jpg'),
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
    created_at: '2026-07-30T05:03:00.000Z',
    catch_id: null,
    weight_oz: null,
    species: null,
    fish_name: null,
    catch_status: null,
    venue_name: null,
    photo_url: postMediaPhoto('0S1A7032.jpg'),
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
    created_at: '2026-07-29T14:20:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000004',
    weight_oz: 610,
    species: 'common carp',
    fish_name: 'Old Leather',
    catch_status: 'under_review',
    venue_name: 'Linear Fisheries',
    photo_url: postMediaPhoto('0S1A7273.jpg'),
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a05',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000005',
    username: 'markd',
    display_name: 'Mark D.',
    avatar_path: 'https://i.pravatar.cc/150?img=15',
    kind: 'catch',
    caption: 'PB broken on a cold, still morning — didn’t expect a bite before 7am.',
    like_count: 74,
    comment_count: 11,
    created_at: '2026-07-29T07:10:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000005',
    weight_oz: 601,
    species: 'mirror carp',
    fish_name: 'Silverback',
    catch_status: 'verified',
    venue_name: 'Wraysbury',
    photo_url: postMediaPhoto('1-DSC_1080.jpg'),
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a06',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000006',
    username: 'chrisb',
    display_name: 'Chris B.',
    avatar_path: 'https://i.pravatar.cc/150?img=22',
    kind: 'catch',
    caption: 'Scraper twenty but I’ll take it, been a slow week.',
    like_count: 38,
    comment_count: 4,
    created_at: '2026-07-28T19:55:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000006',
    weight_oz: 322,
    species: 'common carp',
    fish_name: null,
    catch_status: 'verified',
    venue_name: 'Ephels Fisheries',
    photo_url: postMediaPhoto('_DSC5172.jpg'),
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a07',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000007',
    username: 'dannym',
    display_name: 'Danny M.',
    avatar_path: 'https://i.pravatar.cc/150?img=44',
    kind: 'catch',
    caption: 'Second thirty of the week from the same spot — something’s working.',
    like_count: 63,
    comment_count: 8,
    created_at: '2026-07-28T06:35:00.000Z',
    catch_id: 'c1c1c1c1-0000-0000-0000-000000000007',
    weight_oz: 500,
    species: 'mirror carp',
    fish_name: 'The Don',
    catch_status: 'verified',
    venue_name: 'Yateley Complex',
    photo_url: postMediaPhoto('_DSC5925.jpg'),
  },
  {
    post_id: '3e6a9e0a-1f7f-4b8e-8b1a-5f9a2e8e1a08',
    author_id: 'a1a1a1a1-0000-0000-0000-000000000008',
    username: 'stevep',
    display_name: 'Steve P.',
    avatar_path: 'https://i.pravatar.cc/150?img=59',
    kind: 'photo',
    caption: 'Mist rolling off the lake at first light, no bites yet but who cares.',
    like_count: 29,
    comment_count: 2,
    created_at: '2026-07-27T05:50:00.000Z',
    catch_id: null,
    weight_oz: null,
    species: null,
    fish_name: null,
    catch_status: null,
    venue_name: null,
    photo_url: postMediaPhoto('_MG_8095.jpg'),
  },
];

export async function getFeedItems(): Promise<FeedItemWithPhoto[]> {
  return mockFeedItems;
}
