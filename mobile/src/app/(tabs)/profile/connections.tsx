import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { useTheme } from '@/hooks/use-theme';
import { fetchFollowingIds, fetchFollowList, type FollowListEntry, type FollowListKind } from '@/lib/follows';
import { useAuth } from '@/providers/auth-provider';

const TITLE: Record<FollowListKind, string> = {
  followers: 'Followers',
  following: 'Following',
};

export default function ConnectionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const openAngler = useOpenAngler();
  const { session } = useAuth();
  const { id, kind } = useLocalSearchParams<{ id: string; kind: FollowListKind }>();
  const [entries, setEntries] = useState<FollowListEntry[] | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id || !kind) return;
    let cancelled = false;
    Promise.all([fetchFollowList(id, kind), fetchFollowingIds()]).then(([list, mine]) => {
      if (cancelled) return;
      setEntries(list);
      setFollowingIds(mine);
      // Gold rings, one query for the whole list.
      void fetchPaidMemberIds(list.map((e) => e.id)).then((ids) => {
        if (!cancelled) setPaidIds(ids);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  const viewerId = session?.user.id ?? null;

  return (
    <TabScreen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[Typography.h2, { color: theme.text }]}>{TITLE[kind] ?? 'Anglers'}</Text>
        </View>

        {entries === null ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              {kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {entries.map((angler) => (
              <Pressable
                key={angler.id}
                onPress={() => openAngler(angler.id)}
                style={[styles.row, { borderColor: theme.border }]}>
                {angler.avatarUrl ? (
                  <Image
                    source={{ uri: angler.avatarUrl }}
                    style={[styles.avatar, paidIds.has(angler.id) && paidRing(CONNECTION_AVATAR_SIZE, theme.gold)]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: theme.surfaceElevated },
                      paidIds.has(angler.id) && paidRing(CONNECTION_AVATAR_SIZE, theme.gold),
                    ]}
                  />
                )}
                <View style={styles.info}>
                  <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
                    {angler.displayName}
                  </Text>
                  <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                    @{angler.username}
                  </Text>
                </View>
                {viewerId && viewerId !== angler.id && (
                  <FollowButton anglerId={angler.id} initialIsFollowing={followingIds.has(angler.id)} size="small" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </TabScreen>
  );
}

const CONNECTION_AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    marginTop: Spacing.six,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  list: {
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
  },
  avatar: {
    width: CONNECTION_AVATAR_SIZE,
    height: CONNECTION_AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  info: {
    flex: 1,
    gap: 1,
  },
});
