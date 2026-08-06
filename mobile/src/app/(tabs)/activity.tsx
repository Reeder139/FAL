import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import {
  ACTIVITY_PAGE_SIZE,
  fetchActivity,
  markActivityRead,
  timeAgo,
  type ActivityEvent,
} from '@/lib/activity';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { formatWeightOz } from '@/lib/units';

const AVATAR_SIZE = 40;
const THUMB_SIZE = 40;

/** Icon and colour per event kind. Anything unrecognised — a catch status
 * added later, say — falls back to a neutral bell rather than rendering
 * nothing, so a new kind degrades to "something happened" instead of an
 * invisible row. */
function presentation(kind: string, theme: ReturnType<typeof useTheme>) {
  switch (kind) {
    case 'like':
      return { icon: 'heart' as const, colour: theme.danger };
    case 'comment':
    case 'reply':
      return { icon: 'chatbubble' as const, colour: theme.primary };
    case 'follow':
      return { icon: 'person-add' as const, colour: theme.primary };
    case 'catch_verified':
      return { icon: 'checkmark-circle' as const, colour: theme.gold };
    case 'catch_rejected':
      return { icon: 'close-circle' as const, colour: theme.danger };
    case 'catch_under_review':
      return { icon: 'alert-circle' as const, colour: theme.gold };
    default:
      return { icon: 'notifications' as const, colour: theme.textMuted };
  }
}

function describe(event: ActivityEvent): string {
  const who = event.actorUsername ?? 'Someone';
  const weight = event.weightOz !== null ? ` (${formatWeightOz(event.weightOz)})` : '';
  switch (event.kind) {
    case 'like':
      return `${who} liked your catch`;
    case 'comment':
      return `${who} commented on your catch`;
    case 'reply':
      return `${who} replied to you`;
    case 'follow':
      return `${who} started following you`;
    // The catch rows deliberately do not name a reviewer. Most are written
    // automatically or by service_role and have no actor at all, and naming
    // an individual admin on a rejection invites the argument to be taken up
    // with them personally.
    case 'catch_verified':
      return `Your catch${weight} was verified`;
    case 'catch_rejected':
      return `Your catch${weight} was rejected`;
    case 'catch_under_review':
      return `Your catch${weight} is under review`;
    default:
      return 'Something happened on your account';
  }
}

export default function ActivityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const openAngler = useOpenAngler();

  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActivity()
      .then((page) => {
        if (cancelled) return;
        setEvents(page);
        setHasMore(page.length === ACTIVITY_PAGE_SIZE);
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setError(true);
        }
      });
    // Opening the tab is what "seen" means. Fire and forget: a failure here
    // only means the badge shows once more.
    void markActivityRead();
    return () => {
      cancelled = true;
    };
  }, []);

  // Gold rings, same as everywhere else an avatar appears.
  useEffect(() => {
    const ids = (events ?? []).map((e) => e.actorId).filter((id): id is string => id !== null);
    if (ids.length === 0) return;
    let cancelled = false;
    fetchPaidMemberIds(ids).then((set) => {
      if (!cancelled) setPaidIds(set);
    });
    return () => {
      cancelled = true;
    };
  }, [events]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !events || events.length === 0) return;
    setLoadingMore(true);
    fetchActivity(events[events.length - 1].occurredAt)
      .then((page) => {
        setEvents((prev) => [...(prev ?? []), ...page]);
        setHasMore(page.length === ACTIVITY_PAGE_SIZE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [events, hasMore, loadingMore]);

  const openTarget = (event: ActivityEvent) => {
    // A follow is about a person; everything else is about a post.
    if (event.kind === 'follow' && event.actorId) {
      openAngler(event.actorId);
      return;
    }
    if (event.postId) router.push({ pathname: '/post/[id]', params: { id: event.postId } });
  };

  const renderRow = ({ item }: { item: ActivityEvent }) => {
    const { icon, colour } = presentation(item.kind, theme);
    const isPaid = item.actorId !== null && paidIds.has(item.actorId);

    return (
      <Pressable
        onPress={() => openTarget(item)}
        style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}
        accessibilityRole="button">
        <View style={styles.avatarWrap}>
          {item.actorAvatarUrl ? (
            <Image
              source={{ uri: item.actorAvatarUrl }}
              style={[styles.avatar, isPaid && paidRing(AVATAR_SIZE, theme.gold)]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarFallback,
                { backgroundColor: theme.surfaceElevated },
                isPaid && paidRing(AVATAR_SIZE, theme.gold),
              ]}>
              <Ionicons name={icon} size={18} color={colour} />
            </View>
          )}
          {/* The glyph rides the avatar's corner when there is a face to put
            * it on, so the row reads as "who" first and "what" second. */}
          {item.actorAvatarUrl && (
            <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={icon} size={12} color={colour} />
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={[Typography.bodySmall, { color: theme.text }]} numberOfLines={2}>
            {describe(item)}
          </Text>
          {item.body && (
            <Text style={[Typography.caption, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text style={[Typography.caption, { color: theme.textMuted }]}>{timeAgo(item.occurredAt)}</Text>
        </View>

        {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.thumb} />}
      </Pressable>
    );
  };

  return (
    <TabScreen>
      <View style={styles.header}>
        <Text style={[Typography.h1, { color: theme.text }]}>Activity</Text>
      </View>

      {events === null ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            {error ? "Couldn't load your activity" : 'Nothing here yet'}
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            {error
              ? 'Pull up the tab again in a moment.'
              : 'Likes, comments, new followers and decisions on your catches will show up here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, index) => `${item.kind}-${item.occurredAt}-${item.actorId ?? 'system'}-${index}`}
          renderItem={renderRow}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.primary} style={styles.footerLoader} /> : null
          }
        />
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  list: {
    width: '100%',
  },
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -Spacing.half,
    bottom: -Spacing.half,
    borderRadius: Radii.circle,
    borderWidth: 1,
    padding: Spacing.half,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radii.sm,
  },
  footerLoader: {
    marginVertical: Spacing.three,
  },
});
