import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BottomTabInset, Radii, Shadows, Spacing } from '@/constants/theme';
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
        <Ionicons name="add" size={28} color={theme.onPrimary} />
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
});
