import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueSummary } from '@/lib/leagueSummary';
import { ordinal } from '@/lib/units';

const LOGO_SIZE = 32;

// TODO: real trend delta once we have standings history to diff against —
// hardcoded placeholder for now, per the design ask.
const PLACEHOLDER_DELTA = '▲3';

function summaryText(summary: LeagueSummary): string {
  switch (summary.kind) {
    case 'no_catches':
      return 'Log your first catch to start scoring';
    case 'no_active_season':
      return "No season is open right now — you'll see your score once one starts";
    case 'member': {
      const parts = [summary.divisionName];
      if (summary.position !== null) parts.push(`${ordinal(summary.position)} of ${summary.divisionMemberCount}`);
      parts.push(`${summary.points.toFixed(1)} pts ${PLACEHOLDER_DELTA}`);
      return parts.join(' · ');
    }
    case 'free': {
      const base = `${summary.points.toFixed(1)} pts this season`;
      const positionPart =
        summary.position !== null && summary.divisionName
          ? ` · you'd be ${ordinal(summary.position)} in ${summary.divisionName}`
          : '';
      return `${base}${positionPart} — Join`;
    }
  }
}

type LeagueStripProps = {
  summary: LeagueSummary;
};

export function LeagueStrip({ summary }: LeagueStripProps) {
  const theme = useTheme();
  const router = useRouter();

  // No running season means there's nothing to join yet, so the prompt
  // would be misleading rather than useful.
  const showJoinPrompt = !summary.isPaidMember && summary.kind !== 'no_active_season';

  return (
    <View style={[styles.container, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
      {/* The standings area and the join link go to different places, so
       * they're separate targets rather than one Pressable wrapping the
       * whole strip. They sit side by side, splitting the row. */}
      <Pressable onPress={() => router.push('/divisions')} style={styles.textGroup}>
        <Text style={[Typography.label, { color: theme.onPrimaryStrong }]}>
          Your Current League Position
        </Text>
        {/* Two lines rather than one: sharing the row with the join prompt
         * leaves too little width to fit the standings on a single line,
         * and truncating the position defeats the point of the strip. */}
        <Text style={[Typography.bodySmall, styles.summaryLine, { color: theme.onPrimaryStrong }]} numberOfLines={2}>
          {summaryText(summary)}
        </Text>
      </Pressable>

      {showJoinPrompt && (
        <Pressable onPress={() => router.push('/join')} style={styles.joinRow} hitSlop={Spacing.one}>
          <Text style={[Typography.caption, styles.joinLink, { color: theme.onPrimaryStrong }]}>
            Join The League to win £20,000 Grand prize
          </Text>
        </Pressable>
      )}

      <Image source={require('@/assets/images/logo.jpg')} style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    borderBottomWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.xs,
  },
  textGroup: {
    // Even split with the join prompt beside it — both wrap rather than
    // either one truncating.
    flex: 1,
  },
  summaryLine: {
    marginTop: Spacing.half,
  },
  joinRow: {
    // Takes the leftover width. The container's own `gap` is what
    // separates it from the standings.
    flex: 1,
  },
  joinLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Radii.sm,
  },
});
