import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchNationalStandings, type NationalStandingRow, type NationalStandings } from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;
const RANK_COLOR_KEYS = ['gold', 'silver', 'bronze'] as const;

function StandingRowItem({ row }: { row: NationalStandingRow }) {
  const theme = useTheme();
  const rankColor = row.rank <= 3 ? theme[RANK_COLOR_KEYS[row.rank - 1]] : theme.textMuted;
  const divisionColor = theme[DIVISION_COLOR_KEYS[(row.divisionRank - 1) % 3]];

  return (
    <View
      style={[
        styles.row,
        { borderColor: theme.border },
        row.isYou && { backgroundColor: theme.surfaceElevated, borderColor: theme.primary },
      ]}>
      <View style={[styles.rankBadge, row.rank <= 3 && { backgroundColor: rankColor }]}>
        <Text style={[Typography.h3, { color: row.rank <= 3 ? theme.background : theme.textMuted }]}>
          {row.rank}
        </Text>
      </View>

      {row.avatarUrl ? (
        <Image source={{ uri: row.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
      )}

      <View style={styles.rowInfo}>
        <View style={styles.rowNameLine}>
          <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
            {row.displayName}
          </Text>
          {row.identityVerified && <Ionicons name="checkmark-circle" size={13} color={theme.primary} />}
          {row.isYou && <Text style={[Typography.caption, { color: theme.primary }]}>You</Text>}
        </View>
        <View style={styles.rowMetaLine}>
          {/* The one thing a national table needs that a divisional one
           * doesn't: which division each angler is actually racing in. */}
          <View style={[styles.divisionPill, { borderColor: divisionColor }]}>
            <Text style={[Typography.caption, { color: divisionColor }]}>Div {row.divisionRank}</Text>
          </View>
          <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
            {row.countingFish} fish · avg {row.avgWeightOz !== null ? formatWeightOz(row.avgWeightOz) : '—'}
            {row.heaviestOz !== null ? ` · best ${formatWeightOz(row.heaviestOz)}` : ''}
          </Text>
        </View>
      </View>

      <Text style={[Typography.statValue, styles.points, { color: theme.primary }]}>
        {row.points.toFixed(1)}
      </Text>
    </View>
  );
}

export default function FFLeagueScreen() {
  const theme = useTheme();
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
          <Text style={[Typography.h1, { color: theme.text }]}>FF League</Text>
          {standings && (
            <Text style={[Typography.bodySmall, { color: theme.primary }]}>{standings.seasonName}</Text>
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
            <View style={[styles.infoStrip, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
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

            {standings.rows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
                  No qualifying catches yet this season.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                {standings.rows.map((row) => (
                  <StandingRowItem key={row.anglerId} row={row} />
                ))}
              </ScrollView>
            )}
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
  list: {
    gap: Spacing.one,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
  },
  rowInfo: {
    flex: 1,
    gap: 1,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  divisionPill: {
    borderWidth: 1,
    borderRadius: Radii.xs,
    paddingHorizontal: Spacing.one,
  },
  points: {
    fontSize: 18,
    lineHeight: 22,
  },
});
