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
  parsePositionMove,
  timeAgo,
  type ActivityEvent,
} from '@/lib/activity';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { formatWeightOz, ordinal } from '@/lib/units';
import { respondToWitnessRequest } from '@/lib/witness';

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
    // Same green-up / red-down as the strip's arrow, so a move means the
    // same thing wherever it is shown.
    case 'position_moved_up':
      return { icon: 'trending-up' as const, colour: theme.success };
    case 'position_overtaken':
      return { icon: 'trending-down' as const, colour: theme.danger };
    case 'witness_request':
      return { icon: 'shield-outline' as const, colour: theme.gold };
    case 'witness_confirmed':
      return { icon: 'shield-checkmark' as const, colour: theme.success };
    case 'witness_declined':
      return { icon: 'shield-outline' as const, colour: theme.danger };
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
    case 'witness_request':
      return `${who} asked you to witness their catch${weight}`;
    case 'witness_confirmed':
      return `${who} confirmed they witnessed your catch${weight}`;
    case 'witness_declined':
      return `${who} could not confirm your catch${weight}`;
    case 'position_moved_up':
    case 'position_overtaken': {
      const move = parsePositionMove(event.body);
      const where = move?.scope === 'division' ? 'your division' : 'the National League';
      if (!move) return 'Your league position changed';
      if (event.kind === 'position_moved_up') {
        return `You moved up to ${ordinal(move.to)} in ${where}`;
      }
      // Named when one angler is identifiable, which is not always: a
      // position can worsen because someone further down scored, with nobody
      // passing this angler directly.
      return event.actorUsername
        ? `${event.actorUsername} overtook you in ${where} — now ${ordinal(move.to)}`
        : `You slipped to ${ordinal(move.to)} in ${where}`;
    }
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
  /* The watermark as it was when this visit began. Anything newer is
   * unread *on this visit* — next time it will have moved past them, which
   * is what marking read means. */
  const [readBefore, setReadBefore] = useState<string | null>(null);
  /* Answered witness requests, by catch id. The feed only carries pending
   * ones, so once answered the row has to stop offering the buttons without
   * waiting for a refetch — and has to say which way it went, because the
   * angler has just made a statement of fact and should see it land. */
  const [answered, setAnswered] = useState<Record<string, 'confirmed' | 'declined' | 'failed'>>({});

  const answerWitness = async (catchId: string, confirmed: boolean) => {
    try {
      await respondToWitnessRequest(catchId, confirmed);
      setAnswered((prev) => ({ ...prev, [catchId]: confirmed ? 'confirmed' : 'declined' }));
    } catch {
      setAnswered((prev) => ({ ...prev, [catchId]: 'failed' }));
    }
  };

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
    // Opening the tab is what "seen" means, so this runs immediately — and
    // returns the watermark it replaced, which is the only way anything can
    // still be shown as unread once it has.
    void markActivityRead().then((previous) => {
      if (!cancelled) setReadBefore(previous);
    });
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
    // A follow is about a person; a league move is about a table; everything
    // else is about a post.
    if (event.kind === 'follow' && event.actorId) {
      openAngler(event.actorId);
      return;
    }
    if (event.kind.startsWith('position_')) {
      const move = parsePositionMove(event.body);
      router.push(move?.scope === 'division' ? '/league/divisions' : '/league');
      return;
    }
    if (event.postId) router.push({ pathname: '/post/[id]', params: { id: event.postId } });
  };

  const renderRow = ({ item }: { item: ActivityEvent }) => {
    const { icon, colour } = presentation(item.kind, theme);
    const isPaid = item.actorId !== null && paidIds.has(item.actorId);
    const unread = readBefore === null || item.occurredAt > readBefore;

    return (
      <Pressable
        onPress={() => openTarget(item)}
        style={[
          styles.row,
          {
            borderColor: unread ? theme.primary : theme.border,
            backgroundColor: unread ? theme.surfaceElevated : theme.surface,
          },
        ]}
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

          {/* The whole point of the notification: the witness answers here
            * rather than being sent somewhere to do it. Siblings of the row's
            * Pressable would be cleaner, but these sit inside it, so each
            * stops the press from also opening the post underneath. */}
          {item.kind === 'witness_request' && item.catchId && (
            <View style={styles.witnessActions}>
              {answered[item.catchId] === undefined ? (
                <>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      void answerWitness(item.catchId!, true);
                    }}
                    accessibilityRole="button"
                    style={[styles.witnessButton, { backgroundColor: theme.gold }]}>
                    <Text style={[Typography.caption, { color: theme.background }]}>
                      I witnessed this
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      void answerWitness(item.catchId!, false);
                    }}
                    accessibilityRole="button"
                    style={[styles.witnessButton, styles.witnessDecline, { borderColor: theme.border }]}>
                    <Text style={[Typography.caption, { color: theme.textSecondary }]}>I didn&rsquo;t</Text>
                  </Pressable>
                </>
              ) : (
                <Text
                  style={[
                    Typography.caption,
                    {
                      color:
                        answered[item.catchId] === 'confirmed'
                          ? theme.success
                          : answered[item.catchId] === 'declined'
                            ? theme.textMuted
                            : theme.danger,
                    },
                  ]}>
                  {answered[item.catchId] === 'confirmed'
                    ? 'You confirmed this catch'
                    : answered[item.catchId] === 'declined'
                      ? 'You said you did not witness this'
                      : 'Could not send your answer — try again shortly'}
                </Text>
              )}
            </View>
          )}
          {item.body && (
            <Text style={[Typography.caption, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text style={[Typography.caption, { color: theme.textMuted }]}>{timeAgo(item.occurredAt)}</Text>
        </View>

        {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.thumb} />}

        {/* A dot as well as the tint. Colour alone is not a distinction for
          * anyone who cannot see this one, and the tint is deliberately
          * subtle. */}
        {unread && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
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
  witnessActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.half,
  },
  witnessButton: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.three,
  },
  witnessDecline: {
    borderWidth: 1,
  },
  unreadDot: {
    width: Spacing.two,
    height: Spacing.two,
    borderRadius: Radii.circle,
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
