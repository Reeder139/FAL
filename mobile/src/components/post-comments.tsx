import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import {
  addComment,
  deleteComment,
  fetchComments,
  FEED_COMMENT_PREVIEW,
  type PostComment,
} from '@/lib/comments';

type PostCommentsProps = {
  postId: string;
  /** The two most recent, already fetched with the feed page. */
  preview: PostComment[];
  commentCount: number;
  /** Null while the viewer is loading — the composer waits rather than
   * offering to post as nobody. */
  viewerId: string | null;
};

/**
 * Comments under a post, in the feed.
 *
 * Inline rather than a screen of their own: a comment is about the photo
 * immediately above it, and sending someone to another route to read two
 * lines costs them the thing the lines are about.
 *
 * The preview arrives with the feed page — this component never fetches on
 * mount, because twenty cards mounting at once would be twenty queries. It
 * only goes to the network when someone expands a thread or writes
 * something, which is per-post and on purpose.
 */
export function PostComments({ postId, preview, commentCount, viewerId }: PostCommentsProps) {
  const theme = useTheme();
  const openAngler = useOpenAngler();

  // Local copies so posting and deleting show immediately. Seeded from the
  // page fetch and replaced wholesale once expanded.
  const [shown, setShown] = useState<PostComment[]>(preview);
  const [total, setTotal] = useState(commentCount);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const hasMore = !expanded && total > shown.length;

  const expand = async () => {
    setLoading(true);
    try {
      const all = await fetchComments(postId);
      setShown(all);
      setTotal(all.length);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    const all = await fetchComments(postId);
    setTotal(all.length);
    // Collapse back to a preview unless they had chosen to see everything,
    // so posting a comment doesn't silently unfurl a hundred others.
    setShown(expanded ? all : all.slice(-FEED_COMMENT_PREVIEW));
  };

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await addComment(postId, body);
      setBody('');
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    setShown((prev) => prev.filter((c) => c.id !== id));
    setTotal((t) => Math.max(t - 1, 0));
    try {
      await deleteComment(id);
    } finally {
      await refresh();
    }
  };

  return (
    <View style={styles.wrap}>
      {hasMore && (
        <Pressable onPress={expand} hitSlop={Spacing.one} accessibilityRole="button">
          <Text style={[Typography.bodySmall, { color: theme.textMuted }]}>
            {loading ? 'Loading…' : `View all ${total} comments`}
          </Text>
        </Pressable>
      )}
      {loading && !expanded && <ActivityIndicator color={theme.primary} size="small" />}

      {shown.map((c) => (
        <View key={c.id} style={styles.line}>
          {/* Name and body on one line, the way a comment reads — not a
            * stacked block with an avatar, which turns two words into a
            * three-line card and pushes the next post off screen. */}
          <Text style={[Typography.bodySmall, styles.body, { color: theme.text }]}>
            <Text style={styles.author} onPress={() => openAngler(c.authorId)}>
              {c.username}
            </Text>
            {'  '}
            {c.body}
          </Text>
          {c.isMine && (
            <Pressable
              onPress={() => handleDelete(c.id)}
              hitSlop={Spacing.two}
              accessibilityRole="button"
              accessibilityLabel="Delete your comment">
              <Text style={[Typography.caption, { color: theme.textMuted }]}>×</Text>
            </Pressable>
          )}
        </View>
      ))}

      {viewerId !== null && (
        <View style={[styles.composer, { borderColor: theme.border }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment…"
            placeholderTextColor={theme.textMuted}
            style={[Typography.bodySmall, styles.input, { color: theme.text }]}
            // Enter sends; the multi-line case is a caption, not a comment.
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!sending}
          />
          {body.trim().length > 0 && (
            <Pressable onPress={handleSend} hitSlop={Spacing.two} accessibilityRole="button">
              <Text style={[Typography.bodySmall, styles.post, { color: theme.primary }]}>
                {sending ? '…' : 'Post'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  body: {
    flex: 1,
  },
  author: {
    fontWeight: '700',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  input: {
    flex: 1,
    // No border or background: it should read as a line you type on, not a
    // form field sitting inside a card.
    paddingVertical: Spacing.one,
    borderRadius: Radii.xs,
  },
  post: {
    fontWeight: '700',
  },
});
