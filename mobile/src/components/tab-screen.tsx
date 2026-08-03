import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeagueStripBar } from '@/components/league-strip-bar';
import { useTheme } from '@/hooks/use-theme';

type TabScreenProps = {
  children: ReactNode;
  /** Feed centers its SafeAreaView directly (the FlatList caps its own
   * width); every other screen leaves this off and caps width on an inner
   * content view instead. */
  centered?: boolean;
};

/**
 * Shared shell for every screen reachable from the bottom tab bar,
 * including nested drill-down screens like league/[id] — background, safe
 * area, and the "Your Current League Position" strip.
 *
 * This is the enforcement point for "every page keeps the top and bottom
 * bars": any new screen under (tabs)/ (top-level or nested in its own
 * stack, same pattern as league/) should wrap its content in this instead
 * of reimplementing the outer View/SafeAreaView pair, so changing the
 * strip — or this shell — updates every page at once instead of needing a
 * per-screen edit.
 */
export function TabScreen({ children, centered }: TabScreenProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={[styles.safeArea, centered && styles.centered]}>
        <LeagueStripBar />
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
  },
});
