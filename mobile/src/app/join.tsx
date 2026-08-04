import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * PLACEHOLDER — the real join/upgrade flow is still to be designed.
 *
 * Lives at the root rather than inside (tabs) so it doesn't have to pick a
 * parent tab: the League Position strip that links here renders on every
 * tab screen, so nesting it under any one of them would be arbitrary. The
 * trade-off is that it has no tab bar, which is why it carries its own
 * Close button. Worth revisiting when it's designed — if it ends up as
 * browsable content rather than a checkout-style flow, it belongs in a tab
 * stack instead (see CLAUDE.md on <TabScreen>).
 *
 * Nothing here is wired to payments yet, and deliberately so — it states
 * what joining gets you and stops.
 */

const BENEFITS = [
  { icon: 'trophy-outline', text: '£20,000 grand prize for the overall winner' },
  { icon: 'medal-outline', text: 'Six £1,500 prizes, one for each division winner' },
  { icon: 'gift-outline', text: 'Tackle bundles and vouchers for monthly comp winners' },
  { icon: 'stats-chart-outline', text: 'Your catches count towards the real league table' },
] as const;

export default function JoinScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[Typography.h1, { color: theme.text }]}>Join the League</Text>
            <Pressable onPress={() => router.back()} hitSlop={Spacing.two}>
              <Text style={[Typography.body, { color: theme.primary }]}>Close</Text>
            </Pressable>
          </View>

          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            You're fishing as a free member — your catches are scored, but they don't count towards
            prizes.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <Text style={[Typography.label, { color: theme.label }]}>What you get</Text>
            {BENEFITS.map((benefit) => (
              <View key={benefit.text} style={styles.benefitRow}>
                <Ionicons name={benefit.icon} size={18} color={theme.primary} />
                <Text style={[Typography.bodySmall, styles.benefitText, { color: theme.text }]}>
                  {benefit.text}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.notice, { borderColor: theme.border }]}>
            <Text style={[Typography.caption, { color: theme.textMuted }]}>
              Sign-up isn't open yet — this page is a placeholder while the join flow and pricing are
              finalised.
            </Text>
          </View>
        </ScrollView>
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
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  benefitText: {
    flex: 1,
  },
  notice: {
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.three,
  },
});
