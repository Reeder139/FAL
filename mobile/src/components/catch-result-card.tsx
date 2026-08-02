import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bandLabel, type CatchResultData } from '@/lib/catchResult';

type CatchResultCardProps = {
  result: CatchResultData;
  onJoinPress: () => void;
};

export function CatchResultCard({ result, onJoinPress }: CatchResultCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[Typography.label, { color: theme.label }]}>
        {result.isMember ? 'Points scored' : "Points it would've scored"}
      </Text>
      <Text style={[Typography.numericHero, { color: theme.text }]}>{result.points.toFixed(1)}</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[Typography.label, { color: theme.label }]}>Season total</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>{result.seasonTotal.toFixed(1)}</Text>
        </View>
        {result.isMember && result.position !== null && (
          <View style={styles.stat}>
            <Text style={[Typography.label, { color: theme.label }]}>League position</Text>
            <Text style={[Typography.statValue, { color: theme.text }]}>#{result.position}</Text>
          </View>
        )}
      </View>

      {!result.isMember && (
        <>
          {result.percentile !== null && result.divisionName && (
            <Text style={[Typography.body, { color: theme.textSecondary }]}>
              At that total, you'd be in the {bandLabel(result.percentile)} of {result.divisionName}.
            </Text>
          )}
          <AppButton title="Join the season to start scoring" onPress={onJoinPress} variant="secondary" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});
