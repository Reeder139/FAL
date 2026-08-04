import { supabase } from '@/lib/supabase';

/**
 * Like or unlike a post.
 *
 * `posts.like_count` is maintained server-side by the `likes_counter`
 * trigger, so nothing here writes it — the client's own count is an
 * optimistic guess that the next feed fetch corrects.
 *
 * Both directions are idempotent. Liking upserts rather than inserting, so a
 * double tap that races itself can't fail on the (post_id, user_id) primary
 * key and make a successful like look like an error; deleting a row that
 * isn't there is already a no-op.
 */
export async function setPostLike(postId: string, liked: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to like a post.');

  if (liked) {
    const { error } = await supabase
      .from('likes')
      .upsert({ post_id: postId, user_id: user.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
  if (error) throw error;
}

/**
 * Which of these posts the signed-in angler has already liked.
 *
 * Scoped to the page's post ids rather than fetching every like they've ever
 * made: the feed is paginated, so this is bounded by page size no matter how
 * long they've been using the app. One query per page, not one per card.
 *
 * Returns an empty set when signed out — nothing is "yours" to have liked.
 */
export async function fetchLikedPostIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);
  if (error) throw error;

  return new Set((data ?? []).map((row) => row.post_id as string));
}
