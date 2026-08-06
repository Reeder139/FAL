import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PersonalBest } from '@/lib/personalBest';
import { formatWeightOz } from '@/lib/units';

type ProfileHeaderProps = {
  anglerId: string;
  avatarUrl: string | null;
  displayName: string;
  username: string;
  /** Resolved PB — declaration vs. best verified catch. See lib/personalBest
   * for why the declaration alone is the wrong thing to show. */
  pb: PersonalBest;
  /** Whether the *declaration* has been evidenced. Only meaningful when the
   * declaration is what set the PB; a verified catch speaks for itself. */
  pbVerified: boolean;
  followerCount: number;
  followingCount: number;
  isSelf: boolean;
  isFollowing: boolean;
  /** Supplied only for your own profile — makes the avatar a button that
   * opens the picker. Omitted elsewhere, so another angler's picture is
   * never tappable. */
  onChangeAvatar?: () => void;
  /** Shows the avatar mid-upload so a slow pick doesn't look like a no-op. */
  changingAvatar?: boolean;
  /** Gold ring on the avatar. Resolved by the screen, which already
   * fetches this angler, rather than by a second lookup here. */
  isPaidMember?: boolean;
};

/** Shared by the self profile screen and the view-another-angler screen.
 *
 * What you see of yourself and what you see of someone else deliberately
 * differ: your own header carries the follower/following counts and taps
 * through to those lists, while another angler's is picture, name and
 * personal best — the public view. The follow button is the mirror image,
 * hidden entirely for isSelf rather than disabled. */
export function ProfileHeader({
  anglerId,
  avatarUrl,
  displayName,
  username,
  pb,
  pbVerified,
  followerCount,
  followingCount,
  isSelf,
  isFollowing,
  onChangeAvatar,
  changingAvatar = false,
  isPaidMember = false,
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
      {onChangeAvatar ? (
        <Pressable
          onPress={onChangeAvatar}
          disabled={changingAvatar}
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Change your profile picture' : 'Add a profile picture'}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.avatarPressed]}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={[styles.avatar, isPaidMember && paidRing(PROFILE_AVATAR_SIZE, theme.gold)]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.surfaceElevated },
                isPaidMember && paidRing(PROFILE_AVATAR_SIZE, theme.gold),
              ]}
            />
          )}
          {/* A camera badge on the rim rather than a caption underneath: it
           * says the picture is editable without adding a row of chrome to a
           * header that's already dense. */}
          <View
            style={[styles.avatarBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
            {changingAvatar ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Ionicons name="camera" size={14} color={theme.onPrimary} />
            )}
          </View>
        </Pressable>
      ) : avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
      )}

      <Text style={[Typography.h1, { color: theme.text }]}>{displayName}</Text>
      <Text style={[Typography.body, { color: theme.textSecondary }]}>@{username}</Text>

      {/* Your own network only. Another angler's public profile is picture,
       * name and personal best — the number of people they follow, and the
       * tap-through to the list of who those people are, isn't yours to
       * browse from a name you tapped in a league table. */}
      {isSelf && (
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
      )}

      {!isSelf && (
        <FollowButton
          anglerId={anglerId}
          initialIsFollowing={isFollowing}
          onChange={(next) => setFollowerCountLocal((c) => c + (next ? 1 : -1))}
        />
      )}

      {pb.oz !== null && (
        <View style={[styles.pbCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[Typography.label, { color: theme.label }]}>Personal best</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>{formatWeightOz(pb.oz)}</Text>
          {/* Three states, not two. A PB set by a verified catch is already
            * evidenced, so prompting for evidence there would be nonsense —
            * the nudge only applies while an unproven declaration is still
            * the biggest number the angler has. */}
          <Text style={[Typography.caption, { color: theme.textMuted }]}>
            {pb.fromVerifiedCatch
              ? 'From a verified catch'
              : pbVerified
                ? 'Verified'
                : 'Unverified — an evidence-backed PB can move you into an easier division'}
          </Text>
        </View>
      )}
    </View>
  );
}

const PROFILE_AVATAR_SIZE = Spacing.six;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: PROFILE_AVATAR_SIZE,
    height: PROFILE_AVATAR_SIZE,
    borderRadius: Radii.circle,
    marginBottom: Spacing.three,
  },
  /** Wraps the avatar so the badge can be positioned against it. The bottom
   * margin lives on the avatar itself, so the badge sits above it rather
   * than in the gap. */
  avatarButton: {
    alignItems: 'center',
  },
  avatarPressed: {
    opacity: 0.7,
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: Spacing.three,
    width: Spacing.four,
    height: Spacing.four,
    borderRadius: Radii.circle,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
