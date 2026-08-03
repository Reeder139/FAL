import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ButtonVariants, Spacing, Typography } from '@/constants/theme';
import type { FeedTab } from '@/lib/feed';

const LABELS: Record<FeedTab, string> = {
  following: 'Following',
  all: 'All',
  league: 'My League',
};

type FeedTabsProps = {
  value: FeedTab;
  onChange: (tab: FeedTab) => void;
  /** My League is hidden entirely (not shown-but-disabled) for anglers with
   * no season_entries row, rather than linking to a tab that's always empty. */
  showLeagueTab: boolean;
};

export function FeedTabs({ value, onChange, showLeagueTab }: FeedTabsProps) {
  const tabs: FeedTab[] = showLeagueTab ? ['following', 'all', 'league'] : ['following', 'all'];

  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = tab === value;
        const variant = active ? ButtonVariants.tabActive : ButtonVariants.tabInactive;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            style={[
              styles.pill,
              {
                backgroundColor: variant.backgroundColor,
                borderWidth: 'borderWidth' in variant ? variant.borderWidth : 0,
                borderColor: 'borderColor' in variant ? variant.borderColor : 'transparent',
                borderRadius: variant.borderRadius,
                paddingVertical: variant.paddingVertical,
                paddingHorizontal: variant.paddingHorizontal,
              },
            ]}>
            <Text style={[Typography.bodySmall, { color: variant.textColor, fontWeight: '700' }]}>
              {LABELS[tab]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    alignItems: 'center',
  },
});
