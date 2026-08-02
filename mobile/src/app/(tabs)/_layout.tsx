import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { CatchFab } from '@/components/catch-fab';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

export default function TabsLayout() {
  const theme = useTheme();
  const { session, loading, needsOnboarding } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <View style={styles.container}>
      <AppTabs />
      {/* Catch isn't a real tab route — it's a raised button that opens
       * /log-catch as a modal, so tapping it hides the bar entirely rather
       * than swapping to yet another persistent tab. */}
      <CatchFab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
