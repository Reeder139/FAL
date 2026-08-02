import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
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

  return <AppTabs />;
}
