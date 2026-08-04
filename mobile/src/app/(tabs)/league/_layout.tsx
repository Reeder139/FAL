import { Stack } from 'expo-router';

/**
 * The League tab's stack. Its index is the National League table — every
 * angler in the season, paid or free, in one standing — with the divisions
 * overview, the leaders board and the division drill-down hanging off it.
 *
 * This is the pattern any future content drill-down page should follow: it
 * keeps the bottom tab bar and Catch FAB visible while pushing to a detail
 * screen, unlike log-catch's modal (a focused single-task flow, where hiding
 * them is deliberate).
 *
 * These pages live here rather than beside (tabs)/index because they have no
 * tabs of their own. A route sitting directly under (tabs) with no matching
 * TabTrigger throws inside AppTabs on web and makes router.push to it a
 * silent no-op — nesting it under the tab that links to it is what keeps it
 * reachable.
 */
export default function LeagueLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="divisions" />
      <Stack.Screen name="leaders" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
