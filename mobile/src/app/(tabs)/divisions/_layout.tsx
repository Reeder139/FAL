import { Stack } from 'expo-router';

/**
 * A nested stack inside the Divisions tab, not a new top-level route. This
 * is the pattern any future content drill-down page should follow — it
 * keeps the bottom tab bar and Catch FAB visible while pushing to a detail
 * screen, unlike log-catch's modal (a focused single-task flow, where
 * hiding them is deliberate).
 */
export default function DivisionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
