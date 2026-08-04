import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import {
  BottomTabInset,
  LeaderAvatarSize,
  LeaderBadgeSize,
  MaxContentWidth,
  Radii,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchDivisionLeaders,
  formatPbRange,
  type DivisionLeaderRow,
  type DivisionLeadersOverview,
} from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

// TODO: real trend delta once we have standings history to diff against —
// hardcoded placeholder for now, same decision as league-strip.tsx.
const PLACEHOLDER_DELTA = '▲ 3';

function LeaderCard({ division, index }: { division: DivisionLeaderRow; index: number }) {
  const theme = useTheme();
  const accent = theme[DIVISION_COLOR_KEYS[index % DIVISION_COLOR_KEYS.length]];
  const leader = division.leader;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: accent }]}>
      {/* Division identity only. The trophy used to sit here as a badge on
       * the left; it's moved onto the avatar's rim, which is both where it
       * belongs (it marks the angler, not the division) and what frees this
       * row to stay out of the leader's way. */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={[Typography.h2, { color: theme.text }]}>{division.name}</Text>
          <Text style={[Typography.body, { color: accent }]}>
            {formatPbRange(division.minPbOz, division.maxPbOz)}
          </Text>
        </View>
        <View style={[styles.memberBadge, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[Typography.statValue, { color: theme.text }]}>{division.memberCount}</Text>
          <Text style={[Typography.label, { color: theme.label }]}>Anglers</Text>
        </View>
      </View>

      {leader ? (
        <>
          <View style={styles.leaderHero}>
            <View style={styles.avatarWrap}>
              {leader.avatarUrl ? (
                <Image source={{ uri: leader.avatarUrl }} style={[styles.avatar, { borderColor: accent }]} />
              ) : (
                <View
                  style={[styles.avatar, { backgroundColor: theme.surfaceElevated, borderColor: accent }]}
                />
              )}
              {/* Border in the card's own colour, so the badge reads as
               * sitting on the rim rather than punched into the avatar. */}
              <View
                style={[styles.trophyBadge, { backgroundColor: accent, borderColor: theme.surface }]}>
                <Ionicons name="trophy" size={18} color={theme.onPrimary} />
              </View>
            </View>

            <View style={styles.leaderNameRow}>
              <Text style={[Typography.h2, { color: theme.text }]} numberOfLines={1}>
                {leader.displayName}
              </Text>
              {leader.identityVerified && (
                <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
              )}
            </View>

            {leader.venueName && (
              <Text style={[Typography.bodySmall, { color: accent }]} numberOfLines={1}>
                {leader.venueName}
              </Text>
            )}

            <Text style={[Typography.numericHero, { color: theme.text }]}>
              {leader.points.toFixed(1)}{' '}
              <Text style={[Typography.body, { color: theme.textMuted }]}>pts</Text>
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[Typography.label, styles.statLabel, { color: theme.label }]}>Counting Fish</Text>
              <Text style={[Typography.statValue, { color: theme.text }]}>{leader.countingFish}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.label, styles.statLabel, { color: theme.label }]}>Avg Weight</Text>
              <Text style={[Typography.statValue, { color: theme.text }]}>
                {leader.avgWeightOz !== null ? formatWeightOz(leader.avgWeightOz) : '—'}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.label, styles.statLabel, { color: theme.label }]}>vs Last Week</Text>
              <Text style={[Typography.statValue, { color: theme.success }]}>{PLACEHOLDER_DELTA}</Text>
            </View>
          </View>

          {leader.pbOz !== null && (
            <View style={[styles.pbPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>PB: </Text>
              <Text style={[Typography.bodySmall, { color: theme.text, fontWeight: '700' }]}>
                {formatWeightOz(leader.pbOz)}
              </Text>
            </View>
          )}
        </>
      ) : (
        <Text style={[Typography.body, styles.noLeader, { color: theme.textSecondary }]}>
          No qualifying catches yet
        </Text>
      )}
    </View>
  );
}

export default function LeadersScreen() {
  const theme = useTheme();
  const [overview, setOverview] = useState<DivisionLeadersOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDivisionLeaders()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TabScreen>
      {loading ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : !overview ? (
        <View style={styles.emptyState}>
          <Text style={[Typography.h1, { color: theme.text }]}>Division Leaders</Text>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            No season is open right now
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Leaders will show up here once the next season starts.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Typography.h1, { color: theme.text }]}>Division Leaders</Text>
          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            The top angler in each division of {overview.seasonName}.
          </Text>

          {overview.divisions.map((division, index) => (
            <LeaderCard key={division.id} division={division} index={index} />
          ))}

          <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[Typography.label, { color: theme.label }]}>How division leaders are determined</Text>
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
              Ranked by total points from each angler's counting fish this season.
            </Text>
          </View>
        </ScrollView>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardTitleGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  memberBadge: {
    alignItems: 'center',
    borderRadius: Radii.md,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  /** The leader as the card's centrepiece: avatar, name, venue and score in
   * one centred column near the top, rather than a thumbnail in a row. */
  leaderHero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatarWrap: {
    width: LeaderAvatarSize,
    height: LeaderAvatarSize,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: Radii.circle,
    // Ring in the division's own colour, which is what ties the leader back
    // to the card they're leading.
    borderWidth: 3,
  },
  trophyBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: LeaderBadgeSize,
    height: LeaderBadgeSize,
    borderRadius: Radii.circle,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statLabel: {
    textAlign: 'center',
  },
  pbPill: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  noLeader: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  infoCard: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
