import { Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radii, Spacing } from '@/constants/theme';

const LOGO_SIZE = 36;

/**
 * Fixed brand mark in the top-right corner, rendered once at the root so it
 * shows on every screen (auth, onboarding, tabs, modals) without each page
 * wiring it up individually. Purely decorative — pointerEvents "none" so it
 * never intercepts taps on whatever's underneath it.
 */
export function AppLogo() {
  return (
    <SafeAreaView edges={['top', 'right']} style={styles.container} pointerEvents="none">
      <Image source={require('@/assets/images/logo.jpg')} style={styles.logo} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    padding: Spacing.two,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: Radii.sm,
  },
});
