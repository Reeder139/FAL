import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { LeagueTable } from '@/components/league-table';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchNationalStandings, type NationalStandings } from '@/lib/divisions';

export default function NationalLeagueScreen() {
  const theme = useTheme();
  // Header stats only — the table itself, including the free-member ghost
  // row, comes from LeagueTable.
  const [standings, setStandings] = useState<NationalStandings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchNationalStandings()
      .then((data) => {
        if (!cancelled) setStandings(data);
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
      <View style={styles.content}>
        {/* Artwork banner goes here once supplied. */}
        <View style={styles.header}>
          <Text style={[Typography.h1, { color: theme.text }]}>National League</Text>
          {standings && (
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>{standings.seasonName}</Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !standings ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
              No season is open right now
            </Text>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              The national table will fill up once the next season starts.
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.infoStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Playing for</Text>
                <Text style={[Typography.body, { color: theme.text }]}>Bragging rights</Text>
              </View>
            </View>

            <LeagueTable divisionId={null} showDivisionBadge />
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
    paddingVertical: Spacing.one,
    gap: Spacing.half,
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
