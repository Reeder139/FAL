import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { LeagueTable } from '@/components/league-table';
import { DivisionPrizeBanner } from '@/components/division-prize-banner';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDivisionStandings, formatPbRange, type DivisionStandings } from '@/lib/divisions';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

export default function DivisionStandingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Only for the header stats (range / member count) — the table itself,
  // including the free-member ghost row, comes from LeagueTable.
  const [standings, setStandings] = useState<DivisionStandings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchDivisionStandings(id)
      .then((data) => {
        if (!cancelled) setStandings(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const accent = standings ? theme[DIVISION_COLOR_KEYS[(standings.rank - 1) % 3]] : theme.primary;

  return (
    <TabScreen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface }]}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <View style={styles.headerTitleGroup}>
            <Text style={[Typography.h2, { color: theme.text }]} numberOfLines={1}>
              {standings ? standings.divisionName : 'Division'}
            </Text>
            {standings && <Text style={[Typography.bodySmall, { color: accent }]}>{standings.seasonName}</Text>}
          </View>
        </View>

        {/* Above the branches: what the division is worth does not depend on
          * whether its standings loaded. */}
        <DivisionPrizeBanner />

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !standings ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              Couldn't find that division.
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.infoStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Range</Text>
                <Text style={[Typography.body, { color: theme.text }]}>
                  {formatPbRange(standings.minPbOz, standings.maxPbOz)}
                </Text>
              </View>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Anglers</Text>
                <Text style={[Typography.body, { color: theme.text }]}>{standings.memberCount}</Text>
              </View>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Top score</Text>
                <Text style={[Typography.body, { color: theme.text }]}>
                  {standings.rows[0] ? `${standings.rows[0].points.toFixed(1)} pts` : '—'}
                </Text>
              </View>
            </View>

            <LeagueTable divisionId={id} />
          </>
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
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  loading: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  infoStat: {
    gap: Spacing.half,
  },
});
