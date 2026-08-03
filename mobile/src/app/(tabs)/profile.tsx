import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeagueStripBar } from '@/components/league-strip-bar';
import { ButtonVariants, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { getPublicStorageUrl } from '@/lib/storage';
import { formatWeightOz } from '@/lib/units';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, signOut } = useAuth();

  const avatarUrl = profile?.avatar_path ? getPublicStorageUrl('post-media', profile.avatar_path) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <LeagueStripBar />

        <View style={styles.content}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
          )}

          <Text style={[Typography.h1, { color: theme.text }]}>{profile?.display_name ?? '—'}</Text>
          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            {profile?.username ? `@${profile.username}` : ''}
          </Text>

          {profile?.declared_pb_oz !== null && profile?.declared_pb_oz !== undefined && (
            <View style={[styles.pbCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[Typography.label, { color: theme.label }]}>Personal best</Text>
              <Text style={[Typography.statValue, { color: theme.text }]}>
                {formatWeightOz(profile.declared_pb_oz)}
              </Text>
              <Text style={[Typography.caption, { color: theme.textMuted }]}>
                {profile.pb_verified
                  ? 'Verified'
                  : 'Unverified — an evidence-backed PB can move you into an easier division'}
              </Text>
            </View>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
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
  avatar: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
    marginBottom: Spacing.three,
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
  logoutButton: {
    marginTop: Spacing.six,
    alignItems: 'center',
  },
});
