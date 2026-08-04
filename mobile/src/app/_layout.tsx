import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Via @/hooks/use-color-scheme, not react-native's hook directly: the web
  // variant re-resolves after hydration, which static rendering needs. With
  // the raw hook this provider stayed on DefaultTheme, leaving
  // react-navigation's #f2f2f2 backdrop behind every screen even in dark mode
  // — hidden while a screen covers it, visible the moment one doesn't.
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
           * bar is naturally hidden while it's open — reserved for focused
           * single-task flows like this one. New content/drill-down pages
           * should NOT follow this pattern: nest them inside the relevant
           * tab's own stack instead (see (tabs)/league/_layout.tsx) so the
           * tab bar and Catch FAB stay visible everywhere else. */}
          <Stack.Screen name="log-catch" options={{ presentation: 'modal' }} />
          {/* Same reasoning as log-catch: a focused single-task flow you
            * finish and dismiss, not a page you browse. */}
          <Stack.Screen name="search-anglers" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
