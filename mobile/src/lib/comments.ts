import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type AuthorEmbed = { username: string | null; avatar_path: string | null };

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  username: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  /** Whether the signed-in angler wrote it — the only one they can remove. */
  isMine: boolean;
}

/**
 * Comments on a post, oldest first — a conversation reads downward.
 *
 * Deleted comments are excluded by RLS (`using (deleted_at is null)`), not
 * by a filter here, so there is no query anywhere that can forget to apply
 * it.
 *
 * `parent_id` exists on the table for threaded replies and is deliberately
 * unused: threading needs indentation, collapse and a reply target, and a
 * flat list is the right amount of structure for a feed this size. Nothing
 * here breaks if replies arrive later — they would simply need grouping.
 */
export async function fetchComments(postId: string): Promise<PostComment[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, body, created_at, profiles:author_id (username, avatar_path)')
    .eq('post_id', postId)
    .order('created_at');
  if (error) throw error;

  return (data ?? []).map((row) => {
    // PostgREST types an embedded relation as an array even where the
    // foreign key makes it one-to-one, so this normalises both shapes rather
    // than asserting one and being wrong on a client upgrade.
    const embedded = (row as unknown as {
      profiles?: AuthorEmbed | AuthorEmbed[] | null;
    }).profiles;
    const author = Array.isArray(embedded) ? embedded[0] : embedded;
    return {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      username: author?.username ?? 'someone',
      avatarUrl: author?.avatar_path ? getPublicStorageUrl('post-media', author.avatar_path) : null,
      body: row.body,
      createdAt: row.created_at,
      isMine: !!user && row.author_id === user.id,
    };
  });
}

/** How many comments sit under a post in the feed before the expand link.
 * Two is what fits without the comments outweighing the photo they are
 * about. */
export const FEED_COMMENT_PREVIEW = 2;

/**
 * The last few comments on each of a page of posts, batched.
 *
 * One RPC for the whole page rather than a query per card — twenty posts
 * would otherwise be twenty round trips on every scroll — and the slicing
 * happens in the database, so a post with four hundred comments still costs
 * two rows.
 */
export async function fetchRecentCommentsForPosts(
  postIds: string[],
  perPost: number = FEED_COMMENT_PREVIEW
): Promise<Map<string, PostComment[]>> {
  const byPost = new Map<string, PostComment[]>();
  if (postIds.length === 0) return byPost;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc('recent_comments_for_posts', {
    p_post_ids: postIds,
    p_limit: perPost,
  });
  if (error) throw error;

  for (const row of (data ?? []) as RecentCommentRow[]) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      username: row.username ?? 'someone',
      avatarUrl: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path) : null,
      body: row.body,
      createdAt: row.created_at,
      isMine: !!user && row.author_id === user.id,
    });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

interface RecentCommentRow {
  post_id: string;
  id: string;
  author_id: string;
  username: string | null;
  avatar_path: string | null;
  body: string;
  created_at: string;
}

export async function addComment(postId: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to comment.');

  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write something first.');

  const { error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: user.id, body: trimmed });
  if (error) throw error;
}

/**
 * Remove your own comment.
 *
 * Soft delete, matching the rest of the app: the row stays and stops being
 * visible. `posts.comment_count` is corrected by a trigger on deleted_at, so
 * nothing here touches the count.
 *
 * Goes through an RPC rather than a plain update. Writing deleted_at from the
 * client is refused — the updated row is one the select policy
 * (`deleted_at is null`) no longer lets the author read, and the write is
 * rejected on the way out. The function states the rule instead of working
 * around the policy.
 */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_own_comment', { p_comment_id: commentId });
  if (error) throw error;
}
