import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppLogo } from '@/components/app-logo';
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
           * bar is naturally hidden while it's open — reserved for focused
           * single-task flows like this one. New content/drill-down pages
           * should NOT follow this pattern: nest them inside the relevant
           * tab's own stack instead (see (tabs)/league/_layout.tsx) so the
           * tab bar and Catch FAB stay visible everywhere else. */}
          <Stack.Screen name="log-catch" options={{ presentation: 'modal' }} />
        </Stack>
        <AppLogo />
      </AuthProvider>
    </ThemeProvider>
  );
}
