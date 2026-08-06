import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CatchGrid } from '@/components/catch-grid';
import { ProfileHeader } from '@/components/profile-header';
import { TabScreen } from '@/components/tab-screen';
import { UnderReviewBanner } from '@/components/under-review-banner';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { CreateMiniLeague } from '@/components/create-mini-league';
import { MembershipCard } from '@/components/membership-card';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { useTheme } from '@/hooks/use-theme';
import { pickAndUploadAvatar } from '@/lib/avatarUpload';
import { fetchBestVerifiedCatchOz, personalBest } from '@/lib/personalBest';
import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();
  const [changingAvatar, setChangingAvatar] = useState(false);
  const [isPaidMember, setIsPaidMember] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [bestVerifiedOz, setBestVerifiedOz] = useState<number | null>(null);

  // Gold ring on the avatar. Its own lookup because this screen fetches one
  // angler, so there is no page of ids to batch it with. Re-runs when the
  // profile refreshes, which is what returning from checkout triggers.
  useEffect(() => {
    const anglerId = profile?.id;
    if (!anglerId) return;
    let cancelled = false;
    fetchPaidMemberIds([anglerId]).then((ids) => {
      if (!cancelled) setIsPaidMember(ids.has(anglerId));
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Fetched here rather than carried on the auth profile: the auth row is
  // cached for the session, and a PB that only refreshed on sign-in is the
  // bug this is fixing. Re-runs whenever the profile is refreshed, which is
  // what a newly verified catch goes through.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    fetchBestVerifiedCatchOz(profile.id).then((oz) => {
      if (!cancelled) setBestVerifiedOz(oz);
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const avatarUrl = profile?.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null;

  // pickAndUploadAvatar only puts the file in storage and hands back a path;
  // writing it onto the profile is the caller's job (onboarding does the same
  // as part of its own save). refreshProfile then repoints the header at the
  // new URL.
  const handleChangeAvatar = async () => {
    if (!profile || changingAvatar) return;
    setChangingAvatar(true);
    setAvatarError(null);
    try {
      const path = await pickAndUploadAvatar();
      if (!path) return; // cancelled, or permission refused
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Could not update your picture.');
    } finally {
      setChangingAvatar(false);
    }
  };

  return (
    <TabScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top-right rather than below the content: at the bottom it sat
         * under the tab bar once the catch grid pushed the page past the
         * viewport. */}
        <View style={styles.topRow}>
          <Pressable
            onPress={signOut}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            // The pill is deliberately compact so it doesn't compete with
            // the profile itself; hitSlop brings the tap target back up to
            // a comfortable size without making it look heavier.
            hitSlop={Spacing.three}
            style={({ pressed }) => [
              styles.logoutButton,
              { borderColor: theme.danger },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="log-out-outline" size={14} color={theme.danger} />
            <Text style={[Typography.caption, styles.logoutLabel, { color: theme.danger }]}>Log out</Text>
          </Pressable>
        </View>

        {profile && (
          <>
            <ProfileHeader
              isPaidMember={isPaidMember}
              anglerId={profile.id}
              avatarUrl={avatarUrl}
              displayName={profile.display_name}
              username={profile.username}
              pb={personalBest(profile.declared_pb_oz, bestVerifiedOz)}
              pbVerified={profile.pb_verified}
              followerCount={profile.follower_count}
              followingCount={profile.following_count}
              isSelf
              isFollowing={false}
              onChangeAvatar={handleChangeAvatar}
              changingAvatar={changingAvatar}
            />
            {avatarError && (
              <Text style={[Typography.bodySmall, styles.avatarError, { color: theme.danger }]}>
                {avatarError}
              </Text>
            )}

            {/* Directly under the PB box: starting a league is the one thing
              * on this screen that creates something, and it is a paid
              * feature, so it sits with the other things that describe the
              * angler rather than down among the settings rows. Renders
              * nothing at all for free members. */}
            {/* Above the mini league button: what you are paying for, and
              * the way to stop, belong with the account rather than with the
              * things the account lets you do. Renders nothing for anyone who
              * has never subscribed. */}
            <MembershipCard />

            <CreateMiniLeague canCreate={isPaidMember} />

            {/* Above the catch grid on purpose: a catch that stopped scoring
              * is the most urgent thing on this screen, and it explains a
              * total the angler may already be puzzled by. */}
            <UnderReviewBanner />

            <Pressable
              onPress={() => router.push('/profile/support')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.supportLink,
                { borderColor: theme.border },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.textSecondary} />
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                Support &amp; contact us
              </Text>
            </Pressable>
            <CatchGrid anglerId={profile.id} />
          </>
        )}
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  supportLink: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  avatarError: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  topRow: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  logoutLabel: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
