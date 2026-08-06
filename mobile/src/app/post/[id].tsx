import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { fetchPost, type FeedItemWithPhoto } from '@/lib/feed';
import { fetchFollowingIds } from '@/lib/follows';
import { fetchPaidMemberIds } from '@/lib/paidMembers';

/**
 * A single post, reached from the Activity tab.
 *
 * At the root rather than under (tabs) for the same reason as log-catch and
 * report-catch: the Activity tab is a single screen, not a stack, and turning
 * it into one to hold this would be a larger change than the screen itself.
 * The trade-off is no tab bar, which is why it carries a Close button — see
 * CLAUDE.md on <TabScreen>. Worth revisiting if posts get opened from more
 * places than this.
 *
 * It renders the same PostCard the feed does rather than a bespoke layout, so
 * likes, comments and reporting behave identically to where the angler last
 * saw them.
 */
export default function PostScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [post, setPost] = useState<FeedItemWithPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [isPaidAuthor, setIsPaidAuthor] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchPost(id)
      .then((data) => {
        if (cancelled) return;
        setPost(data);
        if (data) {
          void fetchPaidMemberIds([data.author_id]).then((ids) => {
            if (!cancelled) setIsPaidAuthor(ids.has(data.author_id));
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPost(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    fetchFollowingIds().then(setFollowingIds);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[Typography.h2, { color: theme.text }]}>Post</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !post ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              That post isn&rsquo;t available any more.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <PostCard
              item={post}
              viewerId={session?.user.id ?? null}
              followingIds={followingIds}
              isPaidMember={isPaidAuthor}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
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
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
  },
});
