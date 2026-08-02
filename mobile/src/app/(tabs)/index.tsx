import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeagueStrip } from '@/components/league-strip';
import { PostCard } from '@/components/post-card';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueSummary, type LeagueSummary } from '@/lib/leagueSummary';
import { getFeedItems, type FeedItemWithPhoto } from '@/lib/mockFeed';

export default function HomeScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<FeedItemWithPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [leagueSummary, setLeagueSummary] = useState<LeagueSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFeedItems().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    fetchLeagueSummary()
      .then((summary) => {
        if (!cancelled) setLeagueSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setLeagueSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Pinned above the list — stays visible while scrolling rather than
         * collapsing on scroll direction, which felt like the less
         * intrusive of the two options: a static strip doesn't compete for
         * attention with its own motion. */}
        {leagueSummary && (
          <View style={styles.stripWrapper}>
            <LeagueStrip summary={leagueSummary} />
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.post_id}
            renderItem={({ item }) => <PostCard item={item} />}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
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
    alignItems: 'center',
  },
  stripWrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  list: {
    width: '100%',
  },
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
});
