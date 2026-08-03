import { StyleSheet, View } from 'react-native';

import { LeagueStrip } from '@/components/league-strip';
import { MaxContentWidth } from '@/constants/theme';
import { useLeagueSummary } from '@/lib/leagueSummary';

/**
 * Self-contained top bar: fetches its own summary and renders nothing until
 * it resolves, so every tab screen can drop this in as its first child
 * without wiring up the fetch itself. Not shown while there's genuinely
 * nothing to summarize yet (useLeagueSummary returns null before the fetch
 * resolves, and fetchLeagueSummary itself returns null for a signed-out
 * user — same "no fabricated state" rule as everywhere else this reads
 * league_table).
 */
export function LeagueStripBar() {
  const summary = useLeagueSummary();
  if (!summary) return null;

  return (
    <View style={styles.wrapper}>
      <LeagueStrip summary={summary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
