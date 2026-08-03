import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedTabs } from '@/components/feed-tabs';
import { PostCard } from '@/components/post-card';
import { SuggestedAnglersList } from '@/components/suggested-anglers';
import { SuggestedFollowsRail } from '@/components/suggested-follows-rail';
import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, ButtonVariants, MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchFeedPage, type FeedItemWithPhoto, type FeedTab } from '@/lib/feed';
import { getLastFeedTab, setLastFeedTab } from '@/lib/feedTabPreference';
import { fetchFollowingIds, hasAnySeasonEntry } from '@/lib/follows';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [tab, setTab] = useState<FeedTab | null>(null);
  const [showLeagueTab, setShowLeagueTab] = useState(false);
  const [items, setItems] = useState<FeedItemWithPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFollowingIds().then(setFollowingIds);
  }, []);

  // Resolve the starting tab once: the persisted preference, unless it was
  // "league" and this angler turns out to have no season_entries row to
  // back that tab with.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLastFeedTab(), hasAnySeasonEntry()]).then(([savedTab, hasEntry]) => {
      if (cancelled) return;
      setShowLeagueTab(hasEntry);
      setTab(savedTab === 'league' && !hasEntry ? 'all' : savedTab);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFirstPage = useCallback((activeTab: FeedTab) => {
    setLoading(true);
    setShowSuggestions(false);
    fetchFeedPage(activeTab, null)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab) loadFirstPage(tab);
  }, [tab, loadFirstPage]);

  const handleTabChange = (next: FeedTab) => {
    setTab(next);
    setLastFeedTab(next);
  };

  const loadMore = () => {
    if (!tab || loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    fetchFeedPage(tab, cursor)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
      })
      .finally(() => setLoadingMore(false));
  };

  const refetchFollowing = () => {
    if (tab === 'following') loadFirstPage('following');
  };

  return (
    <TabScreen centered>
      <SuggestedFollowsRail />

      {tab && (
        <View style={styles.tabsWrapper}>
          <FeedTabs value={tab} onChange={handleTabChange} showLeagueTab={showLeagueTab} />
        </View>
      )}

      {loading || !tab ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : items.length === 0 ? (
        <View style={styles.emptyStateWrapper}>
          {tab === 'following' && !showSuggestions ? (
            <View style={styles.emptyState}>
              <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
                Follow some anglers to fill this up
              </Text>
              <Pressable
                onPress={() => setShowSuggestions(true)}
                style={[
                  styles.findButton,
                  {
                    backgroundColor: ButtonVariants.primary.backgroundColor,
                    borderRadius: ButtonVariants.primary.borderRadius,
                    paddingVertical: ButtonVariants.primary.paddingVertical,
                    paddingHorizontal: ButtonVariants.primary.paddingHorizontal,
                  },
                ]}>
                <Text style={[Typography.button, { color: ButtonVariants.primary.textColor }]}>
                  Find anglers to follow
                </Text>
              </Pressable>
            </View>
          ) : tab === 'following' && showSuggestions ? (
            <SuggestedAnglersList onFollowed={refetchFollowing} />
          ) : (
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              {tab === 'league' ? 'No posts from your league yet' : 'No posts yet'}
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.post_id}
          renderItem={({ item }) => (
            <PostCard item={item} viewerId={session?.user.id ?? null} followingIds={followingIds} />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.primary} style={styles.footerLoader} /> : null
          }
        />
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  tabsWrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  loading: {
    marginTop: Spacing.six,
  },
  emptyStateWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  findButton: {
    alignItems: 'center',
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
  footerLoader: {
    marginVertical: Spacing.three,
  },
});
