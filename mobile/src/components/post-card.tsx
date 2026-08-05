import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { PostComments } from '@/components/post-comments';
import { Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import type { FeedItemWithPhoto } from '@/lib/feed';
import { setPostLike } from '@/lib/likes';
import { formatWeightOz } from '@/lib/units';

type PostCardProps = {
  item: FeedItemWithPhoto;
  /** Null while the viewer is still loading — the follow button hides
   * rather than guessing in that window. */
  viewerId: string | null;
  followingIds: Set<string>;
};

export function PostCard({ item, viewerId, followingIds }: PostCardProps) {
  const theme = useTheme();
  const openAngler = useOpenAngler();
  const [liked, setLiked] = useState(item.liked_by_viewer);
  const [likeCount, setLikeCount] = useState(item.like_count);

  // Resync when the feed refetches. Cards are keyed by post id and so are
  // reused rather than remounted across a refresh, which would otherwise
  // leave this state showing whatever it held before the fetch.
  useEffect(() => {
    setLiked(item.liked_by_viewer);
    setLikeCount(item.like_count);
  }, [item.liked_by_viewer, item.like_count]);

  const toggleLike = async () => {
    // Signed out there's nobody to attribute the like to, and the insert
    // would fail RLS — leave the heart inert rather than flashing on and
    // rolling straight back.
    if (viewerId === null) return;

    const next = !liked;
    setLiked(next);
    setLikeCount((count) => count + (next ? 1 : -1));
    try {
      await setPostLike(item.post_id, next);
    } catch {
      // Put it back. The server-side trigger owns like_count, so the true
      // value returns on the next fetch either way — this is just so the
      // card doesn't sit there claiming a like that didn't land.
      setLiked(!next);
      setLikeCount((count) => count + (next ? -1 : 1));
    }
  };

  const isSelf = viewerId === item.author_id;
  // Shared with every other place a name appears, so your own name lands on
  // the profile tab here too rather than the public read-only view.
  const goToProfile = () => openAngler(item.author_id);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.card]}>
      <View style={styles.header}>
        <Pressable onPress={goToProfile} style={styles.headerIdentity} hitSlop={Spacing.one}>
          {item.avatar_path ? (
            <Image source={{ uri: item.avatar_path }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
          )}
          <Text style={[Typography.h3, { color: theme.text }]}>{item.username}</Text>
        </Pressable>
        {viewerId !== null && !isSelf && (
          <FollowButton anglerId={item.author_id} initialIsFollowing={followingIds.has(item.author_id)} size="small" />
        )}
      </View>

      <View style={styles.photoWrapper}>
        {item.photo_url && (
          <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
        )}
        {item.weight_oz !== null && (
          <View style={[styles.weightBadge, { backgroundColor: theme.overlay }]}>
            <Text style={[Typography.h3, { color: theme.onPrimary }]}>
              {formatWeightOz(item.weight_oz)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {item.venue_name && (
          <Text style={[Typography.caption, { color: theme.textMuted }]}>{item.venue_name}</Text>
        )}

        {item.caption && (
          <Text style={[Typography.body, styles.caption, { color: theme.text }]}>{item.caption}</Text>
        )}

        <View style={styles.actions}>
          {/* The heart is a glyph, so it announces as punctuation without a
            * label. aria-pressed rather than a "Liked"/"Like" name flip, so
            * the control keeps one name and reports its state separately. */}
          <Pressable
            onPress={toggleLike}
            disabled={viewerId === null}
            accessibilityRole="button"
            accessibilityLabel={`Like ${item.username}'s post`}
            aria-pressed={liked}
            style={styles.likeButton}
            hitSlop={Spacing.two}>
            <Text style={[Typography.h2, { color: liked ? theme.danger : theme.textMuted }]}>
              {liked ? '♥' : '♡'}
            </Text>
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>{likeCount}</Text>
          </Pressable>

          <View style={styles.commentButton}>
            <Ionicons name="chatbubble-outline" size={16} color={theme.textSecondary} />
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
              {item.comment_count} {item.comment_count === 1 ? 'comment' : 'comments'}
            </Text>
          </View>
        </View>

        {/* Under the photo, not behind a route. A comment is about the
          * picture directly above it. */}
        <PostComments
          postId={item.post_id}
          preview={item.recent_comments}
          commentCount={item.comment_count}
          viewerId={viewerId}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  avatar: {
    width: Spacing.five,
    height: Spacing.five,
    borderRadius: Radii.circle,
  },
  photoWrapper: {
    width: '100%',
    aspectRatio: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  weightBadge: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  caption: {
    marginTop: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
