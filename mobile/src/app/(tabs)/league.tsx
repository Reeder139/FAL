import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueOverview, formatPbRange, type DivisionOverview, type LeagueOverview } from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

function DivisionCard({ division, index }: { division: DivisionOverview; index: number }) {
  const theme = useTheme();
  const accent = theme[DIVISION_COLOR_KEYS[index % DIVISION_COLOR_KEYS.length]];

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, { backgroundColor: accent }]}>
          <Text style={[Typography.h2, { color: theme.onPrimary }]}>{division.rank}</Text>
        </View>
        <View style={styles.cardTitleGroup}>
          <Text style={[Typography.h2, { color: theme.text }]}>{division.name}</Text>
          <Text style={[Typography.body, { color: accent }]}>
            {formatPbRange(division.minPbOz, division.maxPbOz)}
          </Text>
        </View>
        {division.isYourDivision && (
          <View style={[styles.yourDivisionBadge, { backgroundColor: accent }]}>
            <Text style={[Typography.caption, { color: theme.onPrimary }]}>Your division</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[Typography.label, { color: theme.label }]}>Anglers</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>{division.memberCount}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[Typography.label, { color: theme.label }]}>Top score</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>
            {division.topScore !== null ? division.topScore.toFixed(1) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function LeagueScreen() {
  const theme = useTheme();
  const [overview, setOverview] = useState<LeagueOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLeagueOverview()
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
            <Text style={[Typography.h1, { color: theme.text }]}>Divisions</Text>
            <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
              No season is open right now
            </Text>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              Divisions will show up here once the next season starts.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[Typography.h1, { color: theme.text }]}>Divisions</Text>
            <Text style={[Typography.body, { color: theme.textSecondary }]}>
              Three divisions, seeded by personal best at the start of {overview.seasonName} and
              locked for its duration.
            </Text>
            {overview.currentPbOz !== null && (
              <Text style={[Typography.bodySmall, { color: theme.label }]}>
                Your current PB: {formatWeightOz(overview.currentPbOz)}
              </Text>
            )}

            {overview.divisions.map((division, index) => (
              <DivisionCard key={division.id} division={division} index={index} />
            ))}

            <View style={[styles.reseedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[Typography.label, { color: theme.label }]}>Reseeding</Text>
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                {overview.currentPbOz !== null && overview.nextDivisionName
                  ? `Your current PB is ${formatWeightOz(overview.currentPbOz)} — this will put you in ${overview.nextDivisionName} next season!`
                  : 'Divisions are reseeded at the start of each season based on your current personal best — it updates automatically the moment a verified catch beats it.'}
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
  yourDivisionBadge: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  stat: {
    gap: Spacing.half,
  },
  reseedCard: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
