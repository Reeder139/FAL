import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // DarkTheme unconditionally, matching useTheme() — see the note there for
  // why the app doesn't follow the device scheme. This also settles a bug it
  // was masking: read from react-native's hook, this provider never left
  // DefaultTheme, so react-navigation's #f2f2f2 sat behind every screen even
  // for dark-mode users. Hidden while a screen fills the viewport, visible
  // the moment one doesn't.
  return (
    <ThemeProvider value={DarkTheme}>
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
          {/* Outside (auth) on purpose — see the note in the screen. A
            * recovery link creates a session, and (auth)'s layout redirects
            * anyone holding one straight to the feed. */}
          <Stack.Screen name="reset-password" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
