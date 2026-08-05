import { StyleSheet, Text, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ActivityScreen() {
  const theme = useTheme();

  return (
    <TabScreen>
      <View style={styles.content}>
        <Text style={[Typography.h1, { color: theme.text }]}>Activity</Text>
        <View style={styles.emptyState}>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            Nothing here yet
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Likes, comments, and new followers will show up here once they start coming in.
          </Text>
        </View>
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.six,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
