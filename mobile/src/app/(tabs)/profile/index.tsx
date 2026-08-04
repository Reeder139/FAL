import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CatchGrid } from '@/components/catch-grid';
import { ProfileHeader } from '@/components/profile-header';
import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPublicStorageUrl } from '@/lib/storage';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();

  const avatarUrl = profile?.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null;

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
              anglerId={profile.id}
              avatarUrl={avatarUrl}
              displayName={profile.display_name}
              username={profile.username}
              declaredPbOz={profile.declared_pb_oz}
              pbVerified={profile.pb_verified}
              followerCount={profile.follower_count}
              followingCount={profile.following_count}
              isSelf
              isFollowing={false}
            />
            <CatchGrid anglerId={profile.id} />
          </>
        )}
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
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
