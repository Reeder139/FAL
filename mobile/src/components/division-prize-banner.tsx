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
      <Ionicons name="trophy" size={18} color={theme.gold} />
      {/* bodySmall, not body: at 15px this line came 9px short of fitting a
        * 375px screen and wrapped, leaving "free" orphaned on a second line
        * — worse than a slightly smaller headline. At 13px bold it clears a
        * 320px viewport with room to spare, and the gold border, wash and
        * trophy carry the prominence that the extra 2px would have. It also
        * matches the join-date notice on the same screens. */}
      <Text style={[Typography.bodySmall, styles.text, { color: theme.text }]}>
        Win your division to win £1,500 tax free
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  text: {
    flex: 1,
    fontWeight: FontWeight.bold,
  },
});
