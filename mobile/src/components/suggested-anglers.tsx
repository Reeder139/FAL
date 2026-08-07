import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { useTheme } from '@/hooks/use-theme';
import { fetchSuggestedAnglers, followAngler, type SuggestedAngler } from '@/lib/follows';

type SuggestedAnglersListProps = {
  /** Called after each successful follow, so the caller can refetch the
   * Following feed to reflect it. */
  onFollowed?: () => void;
};

export function SuggestedAnglersList({ onFollowed }: SuggestedAnglersListProps) {
  const theme = useTheme();
  const openAngler = useOpenAngler();
  const [anglers, setAnglers] = useState<SuggestedAngler[] | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchSuggestedAnglers().then((data) => {
      if (cancelled) return;
      setAnglers(data);
      // Gold rings, resolved for the whole list in one query.
      void fetchPaidMemberIds(data.map((x) => x.id)).then((ids) => {
        if (!cancelled) setPaidIds(ids);
      });
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
            {/* Avatar and name in one target, kept a sibling of the Follow
             * button rather than wrapping it: nested Pressables both fire on
             * web, so Follow would navigate away as it followed. */}
            <Pressable
              onPress={() => openAngler(angler.id)}
              accessibilityRole="link"
              accessibilityLabel={`View ${angler.displayName}'s profile`}
              style={styles.identity}>
              {angler.avatarUrl ? (
                <Image
                  source={{ uri: angler.avatarUrl }}
                  style={[styles.avatar, paidIds.has(angler.id) && paidRing(SUGGESTED_AVATAR_SIZE, theme.gold)]}
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.surfaceElevated },
                    paidIds.has(angler.id) && paidRing(SUGGESTED_AVATAR_SIZE, theme.gold),
                  ]}
                />
              )}
              <View style={styles.info}>
                <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
                  {angler.displayName}
                </Text>
                <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                  {angler.reason === 'division_leader' ? `Leading ${angler.divisionName}` : 'Recently posted'}
                </Text>
              </View>
            </Pressable>
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

const SUGGESTED_AVATAR_SIZE = 40;

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
    width: SUGGESTED_AVATAR_SIZE,
    height: SUGGESTED_AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  /** Takes the row's slack, so the Follow button stays hard right and the
   * whole of the name area — not just the glyphs — opens the profile. */
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
