import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BottomTabInset, Radii, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FAB_SIZE = Spacing.six;
/** How far the FAB's bottom sits above the screen edge — tuned per
 * platform since the native tab bar's real height isn't something this
 * app controls directly (OS-rendered), unlike the custom web tab bar. */
const FAB_BOTTOM = Platform.select({ web: Spacing.five, default: BottomTabInset });

export function CatchFab() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/log-catch')}
        accessibilityLabel="Log a catch"
        style={[styles.fab, { backgroundColor: theme.primary }, Shadows.glowPrimary]}>
        <Ionicons name="camera" size={28} color={theme.onPrimary} />
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
