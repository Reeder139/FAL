import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, View as ViewType } from 'react-native';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomTabInset, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueTableWithGhost, type LeagueTableRow } from '@/lib/leagueTable';
import { formatWeightOz } from '@/lib/units';
import { useAuth } from '@/providers/auth-provider';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

/** Dimmed to read as a projection rather than a standing. */
const GHOST_OPACITY = 0.55;

function JoinPill({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Join now to win real prizes"
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.joinPill, { backgroundColor: theme.gold }, pressed && styles.pressed]}>
      <Text style={[Typography.caption, styles.joinPillText, { color: theme.background }]} numberOfLines={1}>
        JOIN NOW TO WIN REAL PRIZES
      </Text>
    </Pressable>
  );
}

type RowProps = {
  row: LeagueTableRow;
  showDivisionBadge: boolean;
  onJoin: () => void;
};

function TableRow({ row, showDivisionBadge, onJoin }: RowProps) {
  const theme = useTheme();
  const divisionColor = theme[DIVISION_COLOR_KEYS[(row.divisionRank - 1) % 3]];
  const hasScored = row.countingFish > 0;

  return (
    <View
      style={[
        styles.row,
        { borderColor: theme.border },
        row.isYou && !row.isGhost && { backgroundColor: theme.surfaceElevated, borderColor: theme.primary },
        row.isGhost && { opacity: GHOST_OPACITY, borderStyle: 'dashed' },
      ]}>
      {/* An unnumbered row still occupies the rank column, so every name,
       * avatar and score stays on the same left edge as the rows above and
       * below it. A dash rather than a blank: blank reads as a rendering
       * fault, a dash reads as "deliberately not placed". */}
      <View style={styles.rankBadge}>
        <Text style={[Typography.h3, { color: theme.textMuted }]}>
          {row.position === null ? '—' : row.position}
        </Text>
      </View>

      {row.avatarUrl ? (
        <Image source={{ uri: row.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
      )}

      <View style={styles.rowInfo}>
        <View style={styles.rowNameLine}>
          <Text
            style={[Typography.h3, { color: row.isGhost ? theme.textSecondary : theme.text }]}
            numberOfLines={1}>
            {row.username}
          </Text>
          {row.isGhost && <JoinPill onPress={onJoin} />}
        </View>

        <View style={styles.rowMetaLine}>
          {showDivisionBadge && !row.isGhost && (
            <View style={[styles.divisionPill, { borderColor: divisionColor }]}>
              <Text style={[Typography.caption, { color: divisionColor }]}>Div {row.divisionRank}</Text>
            </View>
          )}
          <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
            {hasScored
              ? `${row.countingFish} fish${row.bestFishOz !== null ? ` · best ${formatWeightOz(row.bestFishOz)}` : ''}`
              : 'Log a catch to see where you’d stand'}
          </Text>
        </View>
      </View>

      <Text
        style={[Typography.statValue, styles.points, { color: row.isGhost ? theme.textSecondary : theme.text }]}>
        {row.points.toFixed(1)}
      </Text>
    </View>
  );
}

type LeagueTableProps = {
  /** null = the national table. */
  divisionId: string | null;
  showDivisionBadge?: boolean;
};

/** Bottom padding on the list, needed to back out the row pitch from the
 * reported content height. Must match `styles.list`. */
const LIST_PADDING_BOTTOM = BottomTabInset + Spacing.four;
const ROW_GAP = Spacing.one;

export function LeagueTable({ divisionId, showDivisionBadge = false }: LeagueTableProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const [rows, setRows] = useState<LeagueTableRow[] | null>(null);

  // Sticky-ghost bookkeeping. onLayout is deliberately avoided: it never
  // fires for these nodes on react-native-web (the same silent failure
  // already worked around in catch-grid.tsx), so anything derived from it
  // stays at its initial value and the sticky row never appears. Instead
  // the content height comes from onContentSizeChange, the viewport from a
  // ref measure, and the offset from onScroll — and once the user does
  // scroll, the event refreshes all three at once.
  const containerRef = useRef<ViewType>(null);
  const [scroll, setScroll] = useState({ y: 0, viewport: 0, content: 0 });

  useEffect(() => {
    let cancelled = false;
    fetchLeagueTableWithGhost(divisionId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [divisionId]);

  // Measured once the rows are in, so the sticky row can be right on first
  // paint rather than only after the first scroll.
  useEffect(() => {
    if (!rows) return;
    const frame = requestAnimationFrame(() =>
      containerRef.current?.measureInWindow((_x, _y, _w, height) => {
        if (height > 0) setScroll((s) => (s.viewport === height ? s : { ...s, viewport: height }));
      })
    );
    return () => cancelAnimationFrame(frame);
  }, [rows]);

  const goToJoin = useCallback(() => router.push('/join'), [router]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    setScroll({ y: contentOffset.y, viewport: layoutMeasurement.height, content: contentSize.height });
  };

  const handleContentSizeChange = (_w: number, height: number) =>
    setScroll((s) => (s.content === height ? s : { ...s, content: height }));

  // An angler with no declared PB can't be placed in a division at all, so
  // there's no table to show them — ask for the PB instead.
  //
  // Currently unreachable: AuthProvider's `needsOnboarding` and the (tabs)
  // layout already bounce anyone without a declared_pb_oz to /onboarding
  // before any tab renders. Kept as the guard the spec asks for, so this
  // screen degrades into a prompt rather than an unexplained empty table if
  // onboarding ever becomes skippable.
  if (profile && profile.declared_pb_oz === null) {
    return (
      <View style={styles.prompt}>
        <Ionicons name="fish-outline" size={32} color={theme.textMuted} />
        <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
          Tell us your personal best
        </Text>
        <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
          Your PB decides which division you'd be racing in — add it and we'll show you where you stand.
        </Text>
        <Pressable
          onPress={() => router.push('/onboarding')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.promptButton, { backgroundColor: theme.gold }, pressed && styles.pressed]}>
          <Text style={[Typography.button, { color: theme.background }]}>Add your PB</Text>
        </Pressable>
      </View>
    );
  }

  if (rows === null) {
    return <ActivityIndicator color={theme.primary} style={styles.loading} />;
  }

  if (rows.length === 0) {
    return (
      <View style={styles.prompt}>
        <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
          No qualifying catches yet this season.
        </Text>
      </View>
    );
  }

  const ghostIndex = rows.findIndex((r) => r.isGhost);
  const ghost = ghostIndex >= 0 ? rows[ghostIndex] : null;

  // Every row is the same height by construction — the 36px avatar sets it
  // and nothing in a row wraps — so the pitch can be backed out of the
  // reported content height instead of measuring a node.
  const rowPitch =
    scroll.content > 0 && rows.length > 0
      ? (scroll.content - LIST_PADDING_BOTTOM + ROW_GAP) / rows.length
      : 0;
  const ghostTop = ghostIndex * rowPitch;
  const ghostOnScreen =
    rowPitch === 0 ||
    scroll.viewport === 0 ||
    (ghostTop + rowPitch > scroll.y && ghostTop < scroll.y + scroll.viewport);

  return (
    <View style={styles.container} ref={containerRef}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}>
        {rows.map((row) => (
          <TableRow
            key={row.isGhost ? `ghost-${row.anglerId}` : row.anglerId}
            row={row}
            showDivisionBadge={showDivisionBadge}
            onJoin={goToJoin}
          />
        ))}
      </ScrollView>

      {/* Pinned copy so a free member can always see where they'd stand,
       * however far they've scrolled from their own position. */}
      {ghost && !ghostOnScreen && (
        <View style={[styles.stickyWrapper, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <TableRow row={ghost} showDivisionBadge={showDivisionBadge} onJoin={goToJoin} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
  },
  prompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  promptButton: {
    marginTop: Spacing.two,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
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
    gap: Spacing.two,
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
  joinPill: {
    flexShrink: 1,
    borderRadius: Radii.pill,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
  },
  joinPillText: {
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.3,
  },
  points: {
    fontSize: 18,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.8,
  },
  stickyWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
  },
});
