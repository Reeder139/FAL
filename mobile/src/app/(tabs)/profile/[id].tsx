import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileHeader } from '@/components/profile-header';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAnglerProfile, type AnglerProfile } from '@/lib/follows';

export default function AnglerProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [angler, setAngler] = useState<AnglerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchAnglerProfile(id)
      .then((data) => {
        if (!cancelled) setAngler(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <TabScreen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !angler ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              Couldn't find that angler.
            </Text>
          </View>
        ) : (
          <ProfileHeader
            anglerId={angler.id}
            avatarUrl={angler.avatarUrl}
            displayName={angler.displayName}
            username={angler.username}
            declaredPbOz={angler.declaredPbOz}
            pbVerified={angler.pbVerified}
            followerCount={angler.followerCount}
            followingCount={angler.followingCount}
            isSelf={angler.isSelf}
            isFollowing={angler.isFollowing}
          />
        )}
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
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
