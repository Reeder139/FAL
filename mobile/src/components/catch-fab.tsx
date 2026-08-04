import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BottomTabInset, CatchPlus, Radii, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const FAB_SIZE = Spacing.six;
/** How far the FAB's bottom sits above the screen edge — tuned per
 * platform since the native tab bar's real height isn't something this
 * app controls directly (OS-rendered), unlike the custom web tab bar.
 *
 * On web this tracks the tab bar: the bar sits flush to the bottom of the
 * screen, and this value is what leaves the FAB overhanging its top edge by
 * the same amount it always has. Move the bar and this has to move with it,
 * or the FAB floats free of it. */
const FAB_BOTTOM = Platform.select({ web: Spacing.four, default: BottomTabInset });

export function CatchFab() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/log-catch')}
        accessibilityLabel="Log a catch"
        style={[styles.fab, { backgroundColor: theme.primary }, Shadows.glowPrimary]}>
        {/* Two bars rather than an icon-font glyph — see CatchPlus for why
         * Ionicons' plus can't carry this. Absolutely positioned so they
         * cross at the button's centre instead of stacking. */}
        <View style={[styles.plusBar, styles.plusBarH, { backgroundColor: theme.onPrimary }]} />
        <View style={[styles.plusBar, styles.plusBarV, { backgroundColor: theme.onPrimary }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FAB_BOTTOM,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBar: {
    position: 'absolute',
    borderRadius: Radii.pill,
  },
  plusBarH: {
    width: CatchPlus.length,
    height: CatchPlus.thickness,
  },
  plusBarV: {
    width: CatchPlus.thickness,
    height: CatchPlus.length,
  },
});
