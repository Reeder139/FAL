import { Stack } from 'expo-router';

/** Nested stack inside the Profile tab — same pattern as league/_layout.tsx
 * — so viewing another angler's profile or a followers/following list
 * keeps the tab bar and League Position strip visible. */
export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="connections" />
    </Stack>
  );
}
