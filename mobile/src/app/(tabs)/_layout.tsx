import { Redirect, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { CatchFab } from '@/components/catch-fab';
import { ConvertPrompt } from '@/components/convert-prompt';
import { useTheme } from '@/hooks/use-theme';
import { useLeagueSummary } from '@/lib/leagueSummary';
import { useAuth } from '@/providers/auth-provider';

/** The League tab's own route. The prompt is for landing on the tab itself,
 * not its drill-downs — coming back from /league/divisions shouldn't fire it
 * again on the way past. */
const LEAGUE_ROUTE = '/league';

/** Whether the upsell has already run this session.
 *
 * Module scope on purpose: it has to outlive this component (the layout
 * remounts on sign-out/in) but not the process, which is exactly what
 * "once per session" means — it clears when the app is next launched.
 * Storing it would make it once per install; component state would make it
 * once per mount, which is close enough to every visit to be annoying. */
let promptShownThisSession = false;

export default function TabsLayout() {
  const theme = useTheme();
  const { session, loading, needsOnboarding } = useAuth();

  // Upsell card for members who aren't in the paid competition, shown once a
  // session the first time they land on the League tab. It lives here rather
  // than in the league screen so it renders after the tab bar and Catch
  // button and covers them.
  //
  // Keyed on the pathname changing rather than a focus callback: the focus
  // hook re-runs while the screen stays focused, so setting visible=true
  // inside it fought every dismissal — React batched the false and the true
  // into one render and the card never even flickered.
  const pathname = usePathname();
  const summary = useLeagueSummary();
  const onLeagueTab = pathname === LEAGUE_ROUTE;
  const canPrompt = summary !== null && !summary.isPaidMember;
  const [promptVisible, setPromptVisible] = useState(false);
  useEffect(() => {
    if (onLeagueTab && canPrompt && !promptShownThisSession) {
      promptShownThisSession = true;
      setPromptVisible(true);
    }
  }, [onLeagueTab, canPrompt]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/welcome" />;
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
      <ConvertPrompt visible={promptVisible} onDismiss={() => setPromptVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
