import { Stack } from 'expo-router';

/**
 * A nested stack inside the League tab, not a set of top-level routes. This
 * is the pattern any future content drill-down page should follow — it
 * keeps the bottom tab bar and Catch FAB visible while pushing to a detail
 * screen, unlike log-catch's modal (a focused single-task flow, where
 * hiding them is deliberate).
 *
 * national-league and leaders live here rather than beside (tabs)/index
 * because they no longer have tabs of their own. A route sitting directly
 * under (tabs) with no matching TabTrigger throws inside AppTabs on web and
 * makes router.push to it a silent no-op — nesting it under the tab that
 * links to it is what keeps it reachable.
 */
export default function DivisionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="national-league" />
      <Stack.Screen name="leaders" />
    </Stack>
  );
}
