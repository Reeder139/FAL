import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function LeagueScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={[Typography.h1, { color: theme.text }]}>League</Text>
        <View style={styles.emptyState}>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            Full standings are coming soon
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Division tables, the big fish leaderboard, and the grand final tracker will all live
            here.
          </Text>
        </View>
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
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.six,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
