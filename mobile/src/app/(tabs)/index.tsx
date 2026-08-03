import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { PostCard } from '@/components/post-card';
import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getFeedItems, type FeedItemWithPhoto } from '@/lib/mockFeed';

export default function HomeScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<FeedItemWithPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFeedItems().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TabScreen centered>
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
    </TabScreen>
  );
}

const styles = StyleSheet.create({
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
