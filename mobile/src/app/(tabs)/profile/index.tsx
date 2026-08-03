import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileHeader } from '@/components/profile-header';
import { TabScreen } from '@/components/tab-screen';
import { ButtonVariants, MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPublicStorageUrl } from '@/lib/storage';
import { useAuth } from '@/providers/auth-provider';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();

  const avatarUrl = profile?.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null;

  return (
    <TabScreen>
      <View style={styles.content}>
        {profile && (
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
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  logoutButton: {
    marginTop: Spacing.six,
    alignItems: 'center',
  },
});
