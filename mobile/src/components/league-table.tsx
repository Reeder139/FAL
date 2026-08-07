import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, View as ViewType } from 'react-native';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontWeight, LeagueFishThumb, paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueTableWithGhost, type LeagueTableRow } from '@/lib/leagueTable';
import { NATIONAL_TABLE_LIMIT, selectVisibleRows } from '@/lib/leagueVisibleRows';
import { formatWeightOz } from '@/lib/units';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
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

/**
 * The "N fish · best X" line under an angler's name.
 *
 * The count is dropped when a thumbnail is showing for every counting fish,
 * because then the strip already says how many there are and repeating it
 * costs width the line hasn't got — five thumbnails leave it too narrow for
 * both, and the weight is the part the count can't convey.
 *
 * It stays whenever the strip is short of the full set, which is the common
 * case: only catches logged with a photo get a thumbnail, so "5 fish" beside
 * two pictures is telling you something the pictures don't.
 */
function scoringSummary(row: LeagueTableRow): string {
  const best = row.bestFishOz !== null ? `best ${formatWeightOz(row.bestFishOz)}` : '';
  const complete = row.countingFishPhotos.length === row.countingFish;
  if (complete && best) return best;
  return `${row.countingFish} fish${best ? ` · ${best}` : ''}`;
}

type RowProps = {
  /** Gold ring on the avatar. Resolved once for the whole table rather
   * than per row. */
  isPaidMember: boolean;
  row: LeagueTableRow;
  showDivisionBadge: boolean;
  onJoin: () => void;
};

function TableRow({ row, showDivisionBadge, onJoin, isPaidMember }: RowProps) {
  const theme = useTheme();
  const openAngler = useOpenAngler();
  // Falls back to primary when the angler sits in no division — the badge is
  // hidden in that case anyway, but the colour is read before that is known.
  const divisionColor =
    row.divisionRank !== null ? theme[DIVISION_COLOR_KEYS[(row.divisionRank - 1) % 3]] : theme.primary;
  const hasScored = row.countingFish > 0;
  const openProfile = () => openAngler(row.anglerId);

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

      <Pressable onPress={openProfile} accessibilityRole="link" accessibilityLabel={`View ${row.username}'s profile`}>
        {/* Not derived from isGhost: that only means "unpaid" in a
          * divisional table. The national table deliberately numbers
          * non-paying anglers as ordinary rows, so there isGhost is false
          * for them and the ring would have been wrong. */}
        {row.avatarUrl ? (
          <Image
            source={{ uri: row.avatarUrl }}
            style={[styles.avatar, isPaidMember && paidRing(LEAGUE_AVATAR_SIZE, theme.gold)]}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.surfaceElevated },
              isPaidMember && paidRing(LEAGUE_AVATAR_SIZE, theme.gold),
            ]}
          />
        )}
      </Pressable>

      {/* The counting fish, next to the angler they belong to. Not tappable:
        * the whole strip would otherwise compete with the name beside it for
        * taps on a row that's already only 36px tall, and the fish are here
        * as a glance at what earned the position, not as navigation.
        *
        * Never on a ghost row. That row already spends its name line on the
        * Join call-to-action, and the strip on top of it left the name
        * showing 31px of 71 ("ree…") and the CTA a third of itself — which
        * defeats the only thing a ghost row is there to do. The same angler
        * keeps their strip in the national table, where they take an
        * ordinary numbered row with no pill. */}
      {row.countingFishPhotos.length > 0 && !row.isGhost && (
        <View
          style={styles.fishStrip}
          accessibilityRole="image"
          accessibilityLabel={`${row.countingFishPhotos.length} of ${row.username}'s counting fish`}>
          {row.countingFishPhotos.map((uri, i) => (
            <Image
              key={uri}
              source={{ uri }}
              style={[styles.fishThumb, { borderColor: theme.surface }, i > 0 && styles.fishThumbTucked]}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      <View style={styles.rowInfo}>
        <View style={styles.rowNameLine}>
          {/* The name is its own target, with the Join pill left a sibling
           * beside it rather than wrapped inside. On web a tap inside a
           * nested Pressable fires both handlers, so a ghost row's Join
           * would open that angler's profile on the way past. */}
          <Pressable onPress={openProfile} accessibilityRole="link" style={styles.nameButton}>
            <Text
              style={[Typography.h3, { color: row.isGhost ? theme.textSecondary : theme.text }]}
              numberOfLines={1}>
              {row.username}
            </Text>
          </Pressable>
          {row.isGhost && <JoinPill onPress={onJoin} />}
        </View>

        <View style={styles.rowMetaLine}>
          {showDivisionBadge && !row.isGhost && row.divisionRank !== null && (
            <View style={[styles.divisionPill, { borderColor: divisionColor }]}>
              <Text style={[Typography.caption, { color: divisionColor }]}>Div {row.divisionRank}</Text>
            </View>
          )}
          {/* Two different empty states, because they are two different
            * situations. A member on zero is *in* this division and simply
            * has not scored in it yet — including someone who paid today,
            * whose earlier fish count nationally but not here. A ghost is
            * outside the competition looking in, so theirs stays conditional.
            *
            * Paid is the right test rather than isGhost's inverse in name
            * only: isGhost means "unpaid" in a divisional table, and this is
            * the one line where the distinction carries the meaning. */}
          <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
            {hasScored
              ? scoringSummary(row)
              : row.isGhost
                ? 'Log a catch to see where you’d stand'
                : 'Log your first catch to score'}
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
const LIST_PADDING_BOTTOM = Spacing.four;
const ROW_GAP = Spacing.one;

export function LeagueTable({ divisionId, showDivisionBadge = false }: LeagueTableProps) {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const [rows, setRows] = useState<LeagueTableRow[] | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

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
        if (!cancelled) {
          setRows(data);
          // One lookup for the whole table. Not derived from isGhost:
          // that only marks unpaid rows in a divisional table.
          void fetchPaidMemberIds(data.map((r) => r.anglerId)).then((ids) => {
            if (!cancelled) setPaidIds(ids);
          });
        }
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

  // The national table is a top 50; a division shows everyone in it. Rows
  // arrive sorted by points, so this is the top of the standing — and cutting
  // the list must not cut the angler reading it out of their own league, which
  // is what youBelowCap is for.
  const { shown, capped, youBelowCap } = selectVisibleRows(rows, divisionId);

  const ghostIndex = shown.findIndex((r) => r.isGhost);
  const ghost = ghostIndex >= 0 ? shown[ghostIndex] : null;

  // Every row is the same height by construction — the 36px avatar sets it
  // and nothing in a row wraps — so the pitch can be backed out of the
  // reported content height instead of measuring a node.
  //
  // Only computed when there is a ghost to place, which is what keeps it
  // honest: the arithmetic assumes the scroll content is rows and nothing
  // else, and the "top 50" note at the end of the list would otherwise be
  // counted as part of a row. A ghost only exists in a divisional table and
  // only the national one is capped, so the two never meet — gating on the
  // ghost makes that a property of the code rather than a coincidence.
  const rowPitch =
    ghost && scroll.content > 0 && shown.length > 0
      ? (scroll.content - LIST_PADDING_BOTTOM + ROW_GAP) / shown.length
      : 0;
  const ghostTop = ghostIndex * rowPitch;
  const ghostOnScreen =
    rowPitch === 0 ||
    scroll.viewport === 0 ||
    (ghostTop + rowPitch > scroll.y && ghostTop < scroll.y + scroll.viewport);

  // Being cut off by the cap beats being scrolled past: that row is not in
  // the list at any scroll position, so it stays pinned rather than appearing
  // and disappearing. The two never both apply — a ghost only exists in a
  // divisional table, and those are not capped.
  const pinned = youBelowCap ?? (ghost && !ghostOnScreen ? ghost : null);

  return (
    <View style={styles.container} ref={containerRef}>
      {/* Divisional totals differ from national ones for anyone who joined
        * part-way through, and without saying why that reads as a bug. It
        * is above the table rather than in a footnote because the number it
        * explains is the first thing read. */}
      {divisionId !== null && (
        <View style={[styles.scopeNotice, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.gold} />
          <Text style={[Typography.bodySmall, styles.scopeNoticeText, { color: theme.text }]}>
            Only fish caught after your join date count in this paid member league
          </Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}>
        {shown.map((row) => (
          <TableRow
            key={row.isGhost ? `ghost-${row.anglerId}` : row.anglerId}
            row={row}
            showDivisionBadge={showDivisionBadge}
            onJoin={goToJoin}
            isPaidMember={paidIds.has(row.anglerId)}
          />
        ))}
        {/* Says the list is a top 50 rather than everyone, so a member who
          * cannot find themselves in it knows why. Inside the list, at the
          * end of it, because that is the moment the question occurs — and
          * because the pinned row below is absolutely positioned and would
          * sit on top of it out here. */}
        {capped && (
          <Text style={[Typography.caption, styles.capNote, { color: theme.textMuted }]}>
            Top {NATIONAL_TABLE_LIMIT} of {rows.length} anglers
          </Text>
        )}
      </ScrollView>

      {/* Pinned copy so an angler can always see where they stand, however
       * far they have scrolled from their own position — or, past the cap,
       * when their row is not in the list at all. */}
      {pinned && (
        <View style={[styles.stickyWrapper, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <TableRow
            row={pinned}
            showDivisionBadge={showDivisionBadge}
            onJoin={goToJoin}
            isPaidMember={paidIds.has(pinned.anglerId)}
          />
        </View>
      )}
    </View>
  );
}

/** Sets every row's height, so it is a constant rather than a literal
 * buried in the stylesheet — the gold ring scales from it too. */
const LEAGUE_AVATAR_SIZE = 36;

const styles = StyleSheet.create({
  scopeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  scopeNoticeText: {
    flex: 1,
    fontWeight: FontWeight.bold,
  },
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
    paddingBottom: Spacing.four,
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
    width: LEAGUE_AVATAR_SIZE,
    height: LEAGUE_AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  fishStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    // Must not grow: this sits between the avatar and the name, and letting
    // it take the row's slack would push the name off rather than the other
    // way round. Five thumbs is the ceiling anyway (counting_fish).
    flexGrow: 0,
    flexShrink: 0,
  },
  fishThumb: {
    width: LeagueFishThumb.size,
    height: LeagueFishThumb.size,
    borderRadius: Radii.xs,
    // The rim is what keeps two overlapping fish from reading as one
    // smeared image. Coloured from the row's own surface at the call site.
    borderWidth: 1,
  },
  fishThumbTucked: {
    marginLeft: -LeagueFishThumb.overlap,
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
  /** Shrinks so a long name truncates rather than pushing the Join pill off
   * the row, but doesn't grow — the tap target should end at the name, not
   * stretch across the empty space beside it. */
  nameButton: {
    flexShrink: 1,
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
  capNote: {
    textAlign: 'center',
    paddingTop: Spacing.two,
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
