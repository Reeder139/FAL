import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          {/* Presented as a modal, outside the tabs navigator, so the tab
           * bar is naturally hidden while it's open — same pattern any
           * future full-screen view (post detail, etc.) should follow. */}
          <Stack.Screen name="log-catch" options={{ presentation: 'modal' }} />
          {/* Default push (not modal) — it has its own back arrow, drilling
           * down from a division card on /league rather than presenting as
           * a sheet. */}
          <Stack.Screen name="division/[id]" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
