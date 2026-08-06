import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { DivisionWash, FontWeight, MaxContentWidth, Radii, Spacing, Typography, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a division is worth, on every screen that shows one.
 *
 * The divisional tables are the only part of the app with money attached, and
 * they were the one part that never said so — the national header advertises
 * its prizes, the join page advertises the fund, and the divisions themselves
 * read as a ranking exercise.
 *
 * Shared rather than written twice so the figure cannot end up disagreeing
 * with itself between the overview and the drill-down. If the prize changes it
 * changes here.
 *
 * Gold, like everything else in the app that means money or paid membership.
 */
export function DivisionPrizeBanner() {
  const theme = useTheme();

  return (
    <View style={[styles.banner, { borderColor: theme.gold, backgroundColor: theme.surface }]}>
      <LinearGradient
        colors={[withAlpha(theme.gold, DivisionWash.from), withAlpha(theme.gold, DivisionWash.mid), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.wash}
      />
      <View style={styles.headline}>
        <Ionicons name="trophy" size={18} color={theme.gold} />
        {/* bodySmall, not body: at 15px this line came 9px short of fitting
          * a 375px screen and wrapped, orphaning "free" on a second line.
          * At 13px bold it holds one line down to 360px. */}
        <Text style={[Typography.bodySmall, styles.headlineText, { color: theme.text }]}>
          Win your division to win £1,500 tax free
        </Text>
      </View>
      <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
        And qualify for the grand final — 48 hours against five other winners at a top venue, for
        the <Text style={{ color: theme.gold, fontWeight: FontWeight.bold }}>£20,000 grand prize</Text>.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    // A column now the prize is two claims rather than one: the £1,500 for
    // winning the division, and what winning it qualifies you for.
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    // The wash is absolutely positioned and would otherwise paint over the
    // rounded corners.
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill — react-native-web wants a concrete
    // size here, same as the division cards.
    width: '100%',
    height: '100%',
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headlineText: {
    flex: 1,
    fontWeight: FontWeight.bold,
  },
});
