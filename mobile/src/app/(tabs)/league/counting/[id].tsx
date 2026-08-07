import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { FontWeight, MaxContentWidth, paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import { fetchCountingFish, type CountingFishPage, type CountingScope } from '@/lib/countingFish';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { formatWeightOz, ordinal } from '@/lib/units';

const AVATAR_SIZE = 40;

function caughtOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Every fish earning one angler their league position, open to anyone.
 *
 * Reached by tapping the thumbnail strip on a league table row. The point is
 * scrutiny: the fish deciding the top of a table are the ones worth a second
 * look, and the members themselves are a far larger review team than the
 * admin console will ever be. Each fish leads to its own post, where the
 * comments and the report button already live.
 *
 * Deliberately public rather than admin-only, and deliberately not showing
 * evidence tiers or any of the fraud signals — those live in the `private`
 * schema precisely so that nobody can learn what trips them. What is shown
 * here is what the angler themselves published.
 */
export default function CountingFishScreen() {
  const theme = useTheme();
  const router = useRouter();
  const openAngler = useOpenAngler();
  const { id, scope } = useLocalSearchParams<{ id: string; scope?: string }>();
  const countingScope: CountingScope = scope === 'division' ? 'division' : 'national';

  const [page, setPage] = useState<CountingFishPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchCountingFish(id, countingScope)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        if (data) void fetchPaidMemberIds([data.anglerId]).then((ids) => {
          if (!cancelled) setIsPaid(ids.has(data.anglerId));
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, countingScope]);

  return (
    <TabScreen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={Spacing.three}>
            <Ionicons name="chevron-back" size={24} color={theme.primary} />
          </Pressable>
          <Text style={[Typography.h1, styles.title, { color: theme.text }]} numberOfLines={1}>
            Counting Fish
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !page ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.h2, styles.centred, { color: theme.text }]}>
              Nothing to show
            </Text>
            <Text style={[Typography.body, styles.centred, { color: theme.textSecondary }]}>
              No season is running, or this angler has no scoring fish in it yet.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => openAngler(page.anglerId)} style={styles.angler} accessibilityRole="link">
              {page.avatarUrl ? (
                <Image
                  source={{ uri: page.avatarUrl }}
                  style={[styles.avatar, isPaid && paidRing(AVATAR_SIZE, theme.gold)]}
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.surfaceElevated },
                    isPaid && paidRing(AVATAR_SIZE, theme.gold),
                  ]}
                />
              )}
              <View style={styles.anglerText}>
                <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
                  {page.username}
                </Text>
                {/* Says which competition these are, because the same angler's
                  * counting fish legitimately differ between the two: a
                  * divisional table counts only fish caught inside a paid
                  * stint. Without this the page would look wrong to anyone
                  * comparing it against the other table. */}
                <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                  {page.scope === 'division' ? 'Division' : 'National League'} · {page.seasonName} ·{' '}
                  {page.fish.length} of {page.cap} counting
                </Text>
              </View>
            </Pressable>

            {page.fish.length === 0 ? (
              <Text style={[Typography.body, styles.centred, { color: theme.textSecondary }]}>
                No scoring fish in this competition yet.
              </Text>
            ) : (
              page.fish.map((fish) => {
                const openable = fish.postId !== null;
                return (
                  <Pressable
                    key={fish.catchId}
                    disabled={!openable}
                    onPress={() =>
                      fish.postId &&
                      router.push({ pathname: '/post/[id]', params: { id: fish.postId } })
                    }
                    accessibilityRole={openable ? 'link' : undefined}
                    accessibilityLabel={
                      openable
                        ? `Open the post for ${formatWeightOz(fish.weightOz)}, ranked ${ordinal(fish.rank)}`
                        : undefined
                    }
                    style={({ pressed }) => [
                      styles.card,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                      pressed && styles.pressed,
                    ]}>
                    {fish.photoUrl ? (
                      <Image source={{ uri: fish.photoUrl }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      // Catches logged before in-app photos, and the seeded
                      // data, have no hero image. Shown anyway: a counting
                      // fish with no photo is exactly the sort of thing this
                      // page exists to make visible.
                      <View style={[styles.photo, styles.photoFallback, { backgroundColor: theme.surfaceElevated }]}>
                        <Ionicons name="fish-outline" size={28} color={theme.textMuted} />
                        <Text style={[Typography.caption, { color: theme.textMuted }]}>No photo</Text>
                      </View>
                    )}

                    <View style={styles.cardBody}>
                      <View style={styles.cardTop}>
                        <View style={[styles.rankBadge, { backgroundColor: theme.surfaceElevated }]}>
                          <Text style={[Typography.caption, styles.rankText, { color: theme.textSecondary }]}>
                            {ordinal(fish.rank)}
                          </Text>
                        </View>
                        <Text style={[Typography.h3, { color: theme.text }]}>
                          {formatWeightOz(fish.weightOz)}
                        </Text>
                        {fish.isPb && (
                          <View style={[styles.pill, { borderColor: theme.gold }]}>
                            <Text style={[Typography.caption, { color: theme.gold }]}>PB</Text>
                          </View>
                        )}
                      </View>

                      {fish.fishName && (
                        <Text style={[Typography.bodySmall, { color: theme.textSecondary }]} numberOfLines={1}>
                          {fish.fishName}
                        </Text>
                      )}
                      <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
                        {caughtOn(fish.caughtAt)}
                        {fish.venueName ? ` · ${fish.venueName}` : ''}
                      </Text>
                      <Text style={[Typography.caption, { color: theme.primary }]}>
                        {fish.points.toFixed(1)} pts
                      </Text>
                    </View>

                    {openable && <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
                  </Pressable>
                );
              })
            )}

            <Text style={[Typography.caption, styles.footnote, { color: theme.textMuted }]}>
              Every angler&rsquo;s counting fish are public. Open a catch to comment on it, or to
              report it if something looks wrong.
            </Text>
          </ScrollView>
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
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  title: {
    flex: 1,
  },
  loading: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  centred: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  angler: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  anglerText: {
    flex: 1,
    gap: Spacing.half,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: Radii.sm,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rankBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radii.xs,
  },
  rankText: {
    fontWeight: FontWeight.bold,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
  },
  footnote: {
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
});
