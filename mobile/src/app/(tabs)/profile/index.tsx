import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { CatchGrid } from '@/components/catch-grid';
import { ProfileHeader } from '@/components/profile-header';
import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, ButtonVariants, MaxContentWidth, Spacing, Typography } from '@/constants/theme';
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

        <Pressable
          onPress={signOut}
          style={[
            styles.logoutButton,
            {
              backgroundColor: ButtonVariants.outline.backgroundColor,
              borderColor: theme.danger,
              borderWidth: ButtonVariants.outline.borderWidth,
              borderRadius: ButtonVariants.outline.borderRadius,
              paddingVertical: ButtonVariants.outline.paddingVertical,
              paddingHorizontal: ButtonVariants.outline.paddingHorizontal,
            },
          ]}>
          <Text style={[Typography.button, { color: theme.danger }]}>Log out</Text>
        </Pressable>
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
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  logoutButton: {
    marginTop: Spacing.five,
    alignItems: 'center',
  },
});
