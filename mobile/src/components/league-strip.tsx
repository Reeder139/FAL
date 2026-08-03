import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeagueSummary } from '@/lib/leagueSummary';

const LOGO_SIZE = 32;

// TODO: real trend delta once we have standings history to diff against —
// hardcoded placeholder for now, per the design ask.
const PLACEHOLDER_DELTA = '▲3';

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

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

  return (
    <Pressable
      onPress={() => router.push('/league')}
      style={[styles.container, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
      <View style={styles.textGroup}>
        <Text style={[Typography.label, { color: theme.onPrimaryStrong }]}>Your Current League Position</Text>
        <Text style={[Typography.bodySmall, { color: theme.onPrimaryStrong }]} numberOfLines={1}>
          {summaryText(summary)}
        </Text>
      </View>
      <Image source={require('@/assets/images/logo.jpg')} style={styles.logo} />
    </Pressable>
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
    flex: 1,
    gap: Spacing.half,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Radii.sm,
  },
});
