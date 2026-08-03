import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchDivisionStandings,
  formatPbRange,
  type DivisionStandings,
  type StandingRow,
} from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;
const RANK_COLOR_KEYS = ['gold', 'silver', 'bronze'] as const;

function StandingRowItem({ row, accent }: { row: StandingRow; accent: string }) {
  const theme = useTheme();
  const rankColor = row.rank <= 3 ? theme[RANK_COLOR_KEYS[row.rank - 1]] : theme.textMuted;

  return (
    <View
      style={[
        styles.row,
        { borderColor: theme.border },
        row.isYou && { backgroundColor: theme.surfaceElevated, borderColor: accent },
      ]}>
      <View style={[styles.rankBadge, row.rank <= 3 && { backgroundColor: rankColor }]}>
        <Text
          style={[
            Typography.h3,
            { color: row.rank <= 3 ? theme.background : theme.textMuted },
          ]}>
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
          {row.isYou && <Text style={[Typography.caption, { color: accent }]}>You</Text>}
        </View>
        <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
          {row.countingFish} fish · avg {row.avgWeightOz !== null ? formatWeightOz(row.avgWeightOz) : '—'}
          {row.heaviestOz !== null ? ` · best ${formatWeightOz(row.heaviestOz)}` : ''}
        </Text>
      </View>

      <Text style={[Typography.statValue, { color: accent, fontSize: 18, lineHeight: 22 }]}>
        {row.points.toFixed(1)}
      </Text>
    </View>
  );
}

export default function DivisionStandingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: theme.surface }]}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </Pressable>
            <View style={styles.headerTitleGroup}>
              <Text style={[Typography.h2, { color: theme.text }]} numberOfLines={1}>
                {standings ? standings.divisionName : 'Division'}
              </Text>
              {standings && (
                <Text style={[Typography.bodySmall, { color: accent }]}>{standings.seasonName}</Text>
              )}
            </View>
          </View>

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
              <View style={[styles.infoStrip, { backgroundColor: theme.surface, borderColor: accent }]}>
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

              {standings.rows.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
                    No qualifying catches in this division yet.
                  </Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                  {standings.rows.map((row) => (
                    <StandingRowItem key={row.anglerId} row={row} accent={accent} />
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
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
    paddingVertical: Spacing.two,
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
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
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
    paddingVertical: Spacing.two,
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
});
