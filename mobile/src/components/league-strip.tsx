import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  LeagueStripBannerHeight,
  LeagueStripTextMinWidth,
  MaxContentWidth,
  Radii,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueSummary } from '@/lib/leagueSummary';
import { ordinal } from '@/lib/units';

/** Source dimensions of the prepared banner (see
 * scripts/prepare-join-banner.mjs). Must match the asset exactly: the box is
 * drawn at this ratio, so if the artwork is any shorter than the ratio says,
 * the difference shows up as dead space inside the box that centring the box
 * can't remove. */
const JOIN_BANNER_RATIO = 700 / 139;

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
  const { width: windowWidth } = useWindowDimensions();

  // No running season means there's nothing to join yet, so the prompt
  // would be misleading rather than useful.
  const showJoinPrompt = !summary.isPaidMember && summary.kind !== 'no_active_season';

  // Reserve the text its one-line width, give the rest of the row to the
  // banner, and let the ratio turn that into a height. Sizing this way — a
  // definite height the banner owns — is what makes it the tallest item in
  // the row, so the strip hugs the banner instead of the banner floating in
  // a strip the text made deeper than it.
  //
  // Deliberately not sized from the strip's own height (`alignSelf:
  // 'stretch'` + `aspectRatio`), which reads as the obvious way to fill it:
  // that is a cyclic size dependency — the strip's height depends on its
  // children and the banner's width depends on the strip's height — and the
  // browser breaks the cycle by laying the strip out as if the text had
  // never wrapped, leaving the standings overflowing the border by 16px at
  // 360px wide.
  const spareWidth =
    Math.min(windowWidth, MaxContentWidth) -
    Spacing.three * 2 - // the container's own horizontal padding
    Spacing.three - // the gap between the text and the banner
    LeagueStripTextMinWidth;
  // Floor, not round: the width is derived back out of this height, so
  // rounding up spends a couple of pixels the text column was promised and
  // can be what tips the label onto a second line.
  const bannerHeight = Math.floor(
    Math.min(Math.max(spareWidth / JOIN_BANNER_RATIO, LeagueStripBannerHeight.min), LeagueStripBannerHeight.max)
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      {/* The standings area and the join link go to different places, so
       * they're separate targets rather than one Pressable wrapping the
       * whole strip. They sit side by side, splitting the row. */}
      <Pressable onPress={() => router.push('/league')} style={styles.textGroup}>
        <Text style={[Typography.label, { color: theme.label }]}>Current League Position</Text>
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
          style={[styles.joinRow, { height: bannerHeight, width: bannerHeight * JOIN_BANNER_RATIO }]}
          hitSlop={Spacing.one}>
          {/* Both dimensions are given explicitly rather than leaning on
           * aspectRatio: on react-native-web an Image picks up an inline
           * height from its intrinsic pixel size, which overrides a ratio. */}
          <Image
            source={require('@/assets/images/join-league-banner.png')}
            style={styles.joinBanner}
            resizeMode="contain"
          />
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
    // Tight vertical padding: the banner is the tallest child, so every
    // pixel saved here is a pixel the banner can grow into at the same
    // strip depth.
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.xs,
  },
  textGroup: {
    // Takes whatever the banner leaves. Keeping the label and the standings
    // each on one line is what keeps the strip shallow — a wrap there makes
    // the text column, not the banner, set the strip's height, and the
    // banner then floats in a strip deeper than itself.
    flex: 1,
  },
  summaryLine: {
    marginTop: Spacing.half,
  },
  joinRow: {
    // Width and height come from the render — see bannerHeight there. This
    // item must not flex: its size is the whole point, and letting the row
    // shrink it would break the ratio.
    flexGrow: 0,
    flexShrink: 0,
  },
  joinBanner: {
    width: '100%',
    height: '100%',
  },
});
