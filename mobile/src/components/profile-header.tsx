import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatWeightOz } from '@/lib/units';

type ProfileHeaderProps = {
  anglerId: string;
  avatarUrl: string | null;
  displayName: string;
  username: string;
  declaredPbOz: number | null;
  pbVerified: boolean;
  followerCount: number;
  followingCount: number;
  isSelf: boolean;
  isFollowing: boolean;
};

/** Shared by the self profile screen and the view-another-angler screen —
 * avatar/name, follower/following counts (tap through to the list), and
 * the follow button, hidden entirely for isSelf rather than disabled. */
export function ProfileHeader({
  anglerId,
  avatarUrl,
  displayName,
  username,
  declaredPbOz,
  pbVerified,
  followerCount,
  followingCount,
  isSelf,
  isFollowing,
}: ProfileHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const [followerCountLocal, setFollowerCountLocal] = useState(followerCount);

  useEffect(() => {
    setFollowerCountLocal(followerCount);
  }, [followerCount]);

  const goToConnections = (kind: 'followers' | 'following') =>
    router.push({ pathname: '/profile/connections', params: { id: anglerId, kind } });

  return (
    <View style={styles.container}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
      )}

      <Text style={[Typography.h1, { color: theme.text }]}>{displayName}</Text>
      <Text style={[Typography.body, { color: theme.textSecondary }]}>@{username}</Text>

      <View style={styles.countsRow}>
        <Pressable onPress={() => goToConnections('followers')} style={styles.countItem}>
          <Text style={[Typography.statValue, { color: theme.text }]}>{followerCountLocal}</Text>
          <Text style={[Typography.label, { color: theme.label }]}>Followers</Text>
        </Pressable>
        <Pressable onPress={() => goToConnections('following')} style={styles.countItem}>
          <Text style={[Typography.statValue, { color: theme.text }]}>{followingCount}</Text>
          <Text style={[Typography.label, { color: theme.label }]}>Following</Text>
        </Pressable>
      </View>

      {!isSelf && (
        <FollowButton
          anglerId={anglerId}
          initialIsFollowing={isFollowing}
          onChange={(next) => setFollowerCountLocal((c) => c + (next ? 1 : -1))}
        />
      )}

      {declaredPbOz !== null && (
        <View style={[styles.pbCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[Typography.label, { color: theme.label }]}>Personal best</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>{formatWeightOz(declaredPbOz)}</Text>
          <Text style={[Typography.caption, { color: theme.textMuted }]}>
            {pbVerified
              ? 'Verified'
              : 'Unverified — an evidence-backed PB can move you into an easier division'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
    marginBottom: Spacing.three,
  },
  countsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
    marginTop: Spacing.two,
  },
  countItem: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  pbCard: {
    marginTop: Spacing.four,
    alignSelf: 'stretch',
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
});
