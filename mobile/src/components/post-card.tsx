import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { PostComments } from '@/components/post-comments';
import { paidRing, PostWatermark, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import type { FeedItemWithPhoto } from '@/lib/feed';
import { setPostLike } from '@/lib/likes';
import { formatWeightOz } from '@/lib/units';

/** The avatar's drawn size, so the gold ring can scale to it. Matches
 * styles.avatar below — the two must stay in step. */
const AVATAR_SIZE = Spacing.five;

type PostCardProps = {
  item: FeedItemWithPhoto;
  /** Null while the viewer is still loading — the follow button hides
   * rather than guessing in that window. */
  viewerId: string | null;
  followingIds: Set<string>;
  /** Paid members get a gold ring on their avatar. Passed in rather than
   * looked up here — the feed resolves a whole page in one query. */
  isPaidMember?: boolean;
};

export function PostCard({ item, viewerId, followingIds, isPaidMember }: PostCardProps) {
  const theme = useTheme();
  const router = useRouter();
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
            <Image
              source={{ uri: item.avatar_path }}
              style={[styles.avatar, isPaidMember && paidRing(AVATAR_SIZE, theme.gold)]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.surfaceElevated },
                isPaidMember && paidRing(AVATAR_SIZE, theme.gold),
              ]}
            />
          )}
          {/* One line: the row now has a pill after it and a reserved band
            * beyond that, so an unbounded name would push the pill across the
            * watermark before flex ever got the chance to shrink it. */}
          <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
            {item.username}
          </Text>
        </Pressable>
        {viewerId !== null && !isSelf && (
          <FollowButton anglerId={item.author_id} initialIsFollowing={followingIds.has(item.author_id)} size="small" />
        )}
      </View>

      <View style={styles.photoWrapper}>
        {item.photo_url && (
          <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
        )}
        {/* Only where there is a photo to sit on. photoWrapper keeps its
          * square whether or not one loaded, so an unconditional mark would
          * float on an empty tile and read as a broken image rather than as
          * branding.
          *
          * accessible={false} because it is the same mark on every post in
          * the feed — announcing it each time is noise, not information. */}
        {item.photo_url && (
          <Image
            source={require('@/assets/images/login/carp-leagues-logo.png')}
            style={styles.watermark}
            resizeMode="contain"
            accessible={false}
          />
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

          {/* Bottom right, and only on someone else's catch: there is
            * nothing to report about a photo post, and the function refuses
            * your own fish anyway — better not to offer it than to offer it
            * and reject it. */}
          {item.catch_id !== null && viewerId !== null && !isSelf && (
            <Pressable
              onPress={() => router.push({ pathname: '/report-catch', params: { catchId: item.catch_id } })}
              hitSlop={Spacing.two}
              accessibilityRole="button"
              accessibilityLabel={`Report ${item.username}'s catch`}
              style={styles.reportButton}>
              <Ionicons name="flag-outline" size={13} color={theme.textMuted} />
              <Text style={[Typography.caption, { color: theme.textMuted }]}>Report this catch</Text>
            </Pressable>
          )}
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
    gap: Spacing.two,
    padding: Spacing.three,
    // Left-aligned, so the Follow pill sits beside the name rather than out
    // at the right edge where the watermark rises. The reserve is what keeps
    // it there — see PostWatermark.headerReserve.
    paddingRight: PostWatermark.headerReserve,
    // Kept even though nothing should now overlap: the mark is a later
    // sibling and would paint over this band's contents if a layout change
    // ever let them meet again. Decoration must not win against a name or a
    // control. The band has no background of its own, so the mark still shows
    // through everywhere they aren't.
    zIndex: 1,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // Shrinks rather than grows: growing pushed the pill to the far right,
    // which is the collision this avoids. A long name ellipsises instead.
    flexShrink: 1,
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
  watermark: {
    position: 'absolute',
    // Negative, so the mark rises out of the photo and onto the header band
    // above it. photoWrapper doesn't clip, and the card does — so it lands
    // across the join without escaping the card's rounded corner.
    top: -PostWatermark.riseAbovePhoto,
    right: PostWatermark.inset,
    width: PostWatermark.size,
    height: PostWatermark.size,
    opacity: PostWatermark.opacity,
    // Decoration sitting over the photo — it must never swallow a tap meant
    // for what is underneath it. In the style rather than as a prop: Image
    // has no pointerEvents prop, only View does.
    pointerEvents: 'none',
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
  reportButton: {
    // Pushed to the far right of the row rather than sitting in the flow
    // with the like and comment counts: it is not a peer of those, and it
    // should take a moment to find.
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
});
