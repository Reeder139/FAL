import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontWeight, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueStanding, LeagueSummary } from '@/lib/leagueSummary';
import { ordinal } from '@/lib/units';

/** "Division 3" -> "Div 3", for the strip only.
 *
 * Display-only on purpose: the division's real name comes from the database
 * and is what the league pages, the leaders cards and the ghost row all show.
 * This strip is the one place fighting for width, so it's the one place that
 * abbreviates. */
function shortDivision(name: string): string {
  return name.replace(/^Division\b/i, 'Div');
}

/**
 * The movement arrow.
 *
 * Nothing at all for null (no day-old position to compare against) and
 * nothing for zero (held station). An arrow that is always there stops being
 * read; one that only appears when something happened is worth a glance.
 *
 * Green up, red down — and the arrow itself carries the direction too, so the
 * colour is reinforcement rather than the only signal.
 */
function Delta({ delta }: { delta: number | null }) {
  const theme = useTheme();
  if (delta === null || delta === 0) return null;

  const up = delta > 0;
  return (
    <Text
      style={[Typography.caption, styles.delta, { color: up ? theme.success : theme.danger }]}
      accessibilityLabel={`${Math.abs(delta)} ${up ? 'places up' : 'places down'} since yesterday`}>
      {up ? '▲' : '▼'}
      {Math.abs(delta)}
    </Text>
  );
}

/** One side of the strip. */
function Side({ label, standing }: { label: string; standing: LeagueStanding }) {
  const theme = useTheme();
  const place =
    standing.position !== null
      ? `${ordinal(standing.position)}${standing.memberCount > 0 ? ` of ${standing.memberCount}` : ''}`
      : null;

  return (
    <View style={styles.side}>
      <Text style={[Typography.label, { color: theme.label }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.placeLine}>
        <Text style={[Typography.bodySmall, styles.place, { color: theme.text }]} numberOfLines={1}>
          {place ?? 'Not placed yet'}
        </Text>
        <Delta delta={standing.delta} />
      </View>
      <Text style={[Typography.caption, { color: theme.textSecondary }]} numberOfLines={1}>
        {standing.points.toFixed(1)} pts
      </Text>
    </View>
  );
}

type LeagueStripProps = {
  summary: LeagueSummary;
};

/**
 * The "Current League Position" band at the top of every tab screen.
 *
 * Two standings side by side: the national one on the left, which every
 * angler is in, and the divisional one on the right, which only paid members
 * have. A free member gets the invitation to join in that right-hand space
 * instead — the one place in the app, besides their own profile, where it is
 * still put to them.
 */
export function LeagueStrip({ summary }: LeagueStripProps) {
  const theme = useTheme();
  const router = useRouter();

  const frame = [styles.container, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }];

  if (!summary.hasSeason) {
    return (
      <View style={frame}>
        <Text style={[Typography.bodySmall, { color: theme.textSecondary }]} numberOfLines={2}>
          No season is open right now — you&rsquo;ll see your position once one starts
        </Text>
      </View>
    );
  }

  // Nothing scored yet. Both sides would read "not placed", which says less
  // than one line telling them how to get on the board.
  if (!summary.national) {
    return (
      <Pressable onPress={() => router.push('/league')} style={frame}>
        <Text style={[Typography.label, { color: theme.label }]}>Current League Position</Text>
        <Text style={[Typography.bodySmall, styles.place, { color: theme.text }]} numberOfLines={2}>
          Log your first catch to start scoring
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={frame}>
      <View style={styles.row}>
        {/* Its own target, so tapping the national side goes to the national
          * table and the join prompt opposite goes to checkout. */}
        <Pressable onPress={() => router.push('/league')} style={styles.sidePress}>
          <Side label="National League" standing={summary.national} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {summary.division ? (
          <Pressable onPress={() => router.push('/league/divisions')} style={styles.sidePress}>
            <Side
              label={summary.division.divisionName ? shortDivision(summary.division.divisionName) : 'Division'}
              standing={summary.division}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/join')}
            accessibilityRole="button"
            style={styles.sidePress}>
            <Text
              style={[Typography.caption, styles.joinPrompt, { color: theme.gold }]}
              numberOfLines={3}>
              Join now to play in the Big Leagues for real prizes
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Hairline all the way round rather than just underneath: the strip sits
    // only a shade off the page background, so the border is what actually
    // defines its edge.
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Equal halves, so the divider sits centred whatever either side says.
  sidePress: {
    flex: 1,
  },
  side: {
    gap: Spacing.half,
  },
  placeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  place: {
    fontWeight: FontWeight.bold,
  },
  delta: {
    fontWeight: FontWeight.bold,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: Spacing.three,
  },
  joinPrompt: {
    fontWeight: FontWeight.bold,
    textDecorationLine: 'underline',
  },
});
