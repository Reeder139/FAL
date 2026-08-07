import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueSummary } from '@/lib/leagueSummary';
import { ordinal } from '@/lib/units';

// TODO: real trend delta once we have standings history to diff against —
// hardcoded placeholder for now, per the design ask.
const PLACEHOLDER_DELTA = '▲3';

/** "Division 3" -> "Div 3", for the strip only.
 *
 * Display-only on purpose: the division's real name comes from the database
 * and is what the league pages, the leaders cards and the ghost row all
 * show. This strip is the one place fighting for width, so it's the one
 * place that abbreviates. */
function shortDivision(name: string): string {
  return name.replace(/^Division\b/i, 'Div');
}

function summaryText(summary: LeagueSummary): string {
  switch (summary.kind) {
    case 'no_catches':
      return 'Log your first catch to start scoring';
    case 'no_active_season':
      return "No season is open right now — you'll see your score once one starts";
    case 'member': {
      const parts = [shortDivision(summary.divisionName)];
      if (summary.position !== null) parts.push(`${ordinal(summary.position)} of ${summary.divisionMemberCount}`);
      parts.push(`${summary.points.toFixed(1)} pts ${PLACEHOLDER_DELTA}`);
      return parts.join(' · ');
    }
    // No call to action here any more. The strip states where you stand and
    // taps through to the league; the invitation to join lives on the
    // profile, which is the one screen that is about you rather than about
    // the competition.
    case 'free': {
      const base = `${summary.points.toFixed(1)} pts this season`;
      if (summary.position === null || !summary.divisionName) return base;
      return `${base} · you'd be ${ordinal(summary.position)} in ${shortDivision(summary.divisionName)}`;
    }
  }
}

type LeagueStripProps = {
  summary: LeagueSummary;
};

/**
 * The "Current League Position" band at the top of every tab screen.
 *
 * It used to carry a join banner for free members — artwork advertising the
 * £20,000 prize, sized against the text column so the strip hugged it. That
 * is gone, and with it the width arithmetic that existed only to place it.
 * The strip is now one thing: where you stand, tapping through to the league.
 */
export function LeagueStrip({ summary }: LeagueStripProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/league')}
      style={[styles.container, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      <Text style={[Typography.label, { color: theme.label }]}>Current League Position</Text>
      <Text style={[Typography.bodySmall, styles.summaryLine, { color: theme.text }]} numberOfLines={2}>
        {summaryText(summary)}
      </Text>
    </Pressable>
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
  summaryLine: {
    marginTop: Spacing.half,
  },
});
