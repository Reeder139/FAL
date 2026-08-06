import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ManageMiniLeague } from '@/components/manage-mini-league';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import { fetchMiniLeagueTable, fetchMyMiniLeagues, type MiniLeagueRow } from '@/lib/miniLeagues';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { formatWeightOz } from '@/lib/units';

const AVATAR_SIZE = 36;

export default function MiniLeagueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const openAngler = useOpenAngler();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [rows, setRows] = useState<MiniLeagueRow[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);
  // Bumped by the manage sheet so the table and membership reload after a
  // rename, an add or a removal.
  const [reloadKey, setReloadKey] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // The table function does not return the league's own name — it returns
    // anglers — so the heading comes from the list the angler is already
    // entitled to see.
    Promise.all([fetchMiniLeagueTable(id), fetchMyMiniLeagues()])
      .then(([table, leagues]) => {
        if (cancelled) return;
        setRows(table);
        const league = leagues.find((l) => l.id === id);
        setName(league?.name ?? null);
        setIsOwner(league?.isOwner ?? false);
        setSeasonName(league?.seasonName ?? null);
        void fetchPaidMemberIds(table.map((r) => r.anglerId)).then((ids) => {
          if (!cancelled) setPaidIds(ids);
        });
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  return (
    <TabScreen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.navigate('/league/mini')}
          style={[styles.backButton, { backgroundColor: theme.surface }]}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Back to your mini leagues">
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.titleGroup}>
          <Text style={[Typography.h2, { color: theme.text }]} numberOfLines={1}>
            {name ?? 'Mini League'}
          </Text>
          {seasonName && (
            <Text style={[Typography.bodySmall, { color: theme.primary }]}>{seasonName}</Text>
          )}
        </View>
        {rows !== null && rows.length > 0 && (
          <Pressable
            onPress={() => setManageOpen(true)}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={isOwner ? 'Manage this mini league' : 'Mini league options'}>
            <Ionicons
              name={isOwner ? 'settings-outline' : 'ellipsis-horizontal'}
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        )}
      </View>

      {/* Outside the header, deliberately. The sheet is absolutely
        * positioned, and inside the header row it was bounded by it — 85% of
        * a 60px bar, which is why only its title showed. */}
      {rows !== null && rows.length > 0 && (
        <ManageMiniLeague
          visible={manageOpen}
          onClose={() => setManageOpen(false)}
          miniLeagueId={id}
          leagueName={name ?? 'Mini League'}
          isOwner={isOwner}
          members={rows}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      {rows === null ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            That mini league isn&rsquo;t available to you.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
            <Text style={[Typography.bodySmall, styles.noticeText, { color: theme.text }]}>
              Every angler&rsquo;s best fish count here, paid or not
            </Text>
          </View>

          {rows.map((row) => (
            <View
              key={row.anglerId}
              style={[
                styles.row,
                { borderColor: row.isYou ? theme.primary : theme.border, backgroundColor: theme.surface },
              ]}>
              <Text style={[Typography.h3, styles.position, { color: theme.textSecondary }]}>
                {row.position}
              </Text>
              <Pressable onPress={() => openAngler(row.anglerId)} accessibilityRole="link">
                {row.avatarUrl ? (
                  <Image
                    source={{ uri: row.avatarUrl }}
                    style={[styles.avatar, paidIds.has(row.anglerId) && paidRing(AVATAR_SIZE, theme.gold)]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: theme.surfaceElevated },
                      paidIds.has(row.anglerId) && paidRing(AVATAR_SIZE, theme.gold),
                    ]}
                  />
                )}
              </Pressable>
              <View style={styles.rowBody}>
                <Text style={[Typography.bodySmall, { color: theme.text }]} numberOfLines={1}>
                  {row.username}
                </Text>
                <Text style={[Typography.caption, { color: theme.textMuted }]}>
                  {row.countingFish} {row.countingFish === 1 ? 'fish' : 'fish'}
                  {row.bestFishOz !== null ? ` · best ${formatWeightOz(row.bestFishOz)}` : ''}
                </Text>
              </View>
              <Text style={[Typography.h3, { color: theme.text }]}>{row.points.toFixed(1)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
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
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  noticeText: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  position: {
    width: 26,
    textAlign: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
