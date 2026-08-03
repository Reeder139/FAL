import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchSuggestedAnglers, followAngler, type SuggestedAngler } from '@/lib/follows';

type SuggestedAnglersListProps = {
  /** Called after each successful follow, so the caller can refetch the
   * Following feed to reflect it. */
  onFollowed?: () => void;
};

export function SuggestedAnglersList({ onFollowed }: SuggestedAnglersListProps) {
  const theme = useTheme();
  const [anglers, setAnglers] = useState<SuggestedAngler[] | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchSuggestedAnglers().then((data) => {
      if (!cancelled) setAnglers(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFollow = async (id: string) => {
    setFollowedIds((prev) => new Set(prev).add(id));
    try {
      await followAngler(id);
      onFollowed?.();
    } catch {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (anglers === null) {
    return <ActivityIndicator color={theme.primary} style={styles.loading} />;
  }

  if (anglers.length === 0) {
    return (
      <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
        No anglers to suggest yet.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {anglers.map((angler) => {
        const followed = followedIds.has(angler.id);
        return (
          <View key={angler.id} style={[styles.row, { borderColor: theme.border }]}>
            {angler.avatarUrl ? (
              <Image source={{ uri: angler.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
            )}
            <View style={styles.info}>
              <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
                {angler.displayName}
              </Text>
              <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                {angler.reason === 'division_leader' ? `Leading ${angler.divisionName}` : 'Recently posted'}
              </Text>
            </View>
            <Pressable
              onPress={() => handleFollow(angler.id)}
              disabled={followed}
              style={[
                styles.followButton,
                followed
                  ? { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1 }
                  : { backgroundColor: theme.primary },
              ]}>
              <Text style={[Typography.caption, { color: followed ? theme.textMuted : theme.onPrimaryStrong, fontWeight: '700' }]}>
                {followed ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: Spacing.four,
  },
  list: {
    width: '100%',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radii.circle,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  followButton: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
