import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueSummary } from '@/lib/leagueSummary';
import { ordinal } from '@/lib/units';

/** Source dimensions of the prepared banner (see
 * scripts/prepare-join-banner.mjs). */
const JOIN_BANNER_RATIO = 700 / 189;
/** Ceiling on the banner's width. At phone width the column share already
 * lands under this, so it only bites on wider viewports — where the banner
 * would otherwise keep growing with the 800px content column. */
const JOIN_BANNER_MAX_WIDTH = 150;

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
    <View style={[styles.container, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      {/* The standings area and the join link go to different places, so
       * they're separate targets rather than one Pressable wrapping the
       * whole strip. They sit side by side, splitting the row. */}
      <Pressable onPress={() => router.push('/divisions')} style={styles.textGroup}>
        <Text style={[Typography.label, { color: theme.label }]}>Your Current League Position</Text>
        {/* Two lines rather than one: sharing the row with the join prompt
         * leaves too little width to fit the standings on a single line,
         * and truncating the position defeats the point of the strip. */}
        <Text style={[Typography.bodySmall, styles.summaryLine, { color: theme.text }]} numberOfLines={2}>
          {summaryText(summary)}
        </Text>
      </Pressable>

      {showJoinPrompt && (
        <Pressable
          onPress={() => router.push('/join')}
          accessibilityRole="button"
          accessibilityLabel="Join the League to win the £20,000 grand prize"
          style={styles.joinRow}
          hitSlop={Spacing.one}>
          {/* The ratio sits on a wrapper View, not the Image: on
           * react-native-web an Image gets an inline height from its
           * intrinsic pixel size, which overrides aspectRatio. */}
          <View style={styles.joinBannerBox}>
            <Image
              source={require('@/assets/images/join-league-banner.png')}
              style={styles.joinBanner}
              resizeMode="contain"
            />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    // Hairline all the way round rather than just underneath: the strip now
    // sits only a shade off the page background, so the border is what
    // actually defines its edge.
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.xs,
  },
  textGroup: {
    // The larger share, sized so the label and the standings each fit on
    // one line. That's what keeps the strip shallow: at an even split both
    // wrapped to two lines and the text column, not the banner, was
    // setting the strip's height.
    flex: 1.6,
  },
  summaryLine: {
    marginTop: Spacing.half,
  },
  joinRow: {
    // Takes the leftover width. The container's own `gap` is what
    // separates it from the standings.
    flex: 1,
    // Capped, or the banner scales with the column: at the 800px content
    // width it reached 288x78 and pushed the strip to 96px deep, leaving
    // the standings floating in the middle of it. Past phone width the
    // banner should stay put rather than grow.
    maxWidth: JOIN_BANNER_MAX_WIDTH,
  },
  joinBannerBox: {
    width: '100%',
    // Matches the prepared asset (700x189) so it never distorts.
    aspectRatio: JOIN_BANNER_RATIO,
  },
  joinBanner: {
    width: '100%',
    height: '100%',
  },
});
