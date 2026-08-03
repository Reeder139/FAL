import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
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
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, { backgroundColor: accent }]}>
          <Ionicons name="trophy" size={20} color={theme.onPrimary} />
        </View>
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
          <View style={styles.leaderRow}>
            {leader.avatarUrl ? (
              <Image source={{ uri: leader.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
            )}
            <View style={styles.leaderNameGroup}>
              <View style={styles.leaderNameRow}>
                <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
                  {leader.displayName}
                </Text>
                {leader.identityVerified && (
                  <Ionicons name="checkmark-circle" size={15} color={theme.primary} />
                )}
              </View>
              {leader.venueName && (
                <Text style={[Typography.bodySmall, { color: accent }]} numberOfLines={1}>
                  {leader.venueName}
                </Text>
              )}
            </View>
          </View>

          <Text style={[Typography.numericHero, { color: theme.text }]}>
            {leader.points.toFixed(1)} <Text style={[Typography.body, { color: theme.textMuted }]}>pts</Text>
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[Typography.label, { color: theme.label }]}>Counting Fish</Text>
              <Text style={[Typography.statValue, { color: theme.text }]}>{leader.countingFish}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.label, { color: theme.label }]}>Avg Weight</Text>
              <Text style={[Typography.statValue, { color: theme.text }]}>
                {leader.avgWeightOz !== null ? formatWeightOz(leader.avgWeightOz) : '—'}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[Typography.label, { color: theme.label }]}>vs Last Week</Text>
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
        <Text style={[Typography.body, { color: theme.textSecondary }]}>No qualifying catches yet</Text>
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
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
  rankBadge: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
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
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
  },
  leaderNameGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  leaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  stat: {
    gap: Spacing.half,
  },
  pbPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  infoCard: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
