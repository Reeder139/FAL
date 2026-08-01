import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FeedItemWithPhoto } from '@/lib/mockFeed';
import { formatWeightOz } from '@/lib/units';

type PostCardProps = {
  item: FeedItemWithPhoto;
};

export function PostCard({ item }: PostCardProps) {
  const theme = useTheme();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.like_count);

  const toggleLike = () => {
    setLikeCount((count) => (liked ? count - 1 : count + 1));
    setLiked((prev) => !prev);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.card]}>
      <View style={styles.header}>
        {item.avatar_path ? (
          <Image source={{ uri: item.avatar_path }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
        )}
        <Text style={[Typography.h3, { color: theme.text }]}>{item.username}</Text>
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
          <Pressable onPress={toggleLike} style={styles.likeButton} hitSlop={Spacing.two}>
            <Text style={[Typography.h2, { color: liked ? theme.danger : theme.textMuted }]}>
              {liked ? '♥' : '♡'}
            </Text>
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>{likeCount}</Text>
          </Pressable>

          <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
            {item.comment_count} {item.comment_count === 1 ? 'comment' : 'comments'}
          </Text>
        </View>
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
});
