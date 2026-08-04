import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Children } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';

import { FAB_SIZE } from './catch-fab';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';

// The raised Catch button floats centered over this bar (see catch-fab.tsx)
// — it isn't one of the TabTriggers below. Reserve a gap the same width as
// the FAB (plus its glow) in the middle of the tab row so it never sits on
// top of a real tab, splitting the triggers into a left/right group either
// side of it.
const FAB_CLEARANCE = FAB_SIZE + Spacing.two;
const LEFT_TAB_COUNT = 2;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Feed</TabButton>
          </TabTrigger>
          <TabTrigger name="national-league" href="/national-league" asChild>
            <TabButton>National League</TabButton>
          </TabTrigger>
          <TabTrigger name="divisions" href="/divisions" asChild>
            <TabButton>Divisions</TabButton>
          </TabTrigger>
          <TabTrigger name="leaders" href="/leaders" asChild>
            <TabButton>Leaders</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Profile</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButtonPressable, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        {/* Two lines, centred: "National League" can't fit one line in the
         * ~47px each tab gets at phone width. The others stay single-line
         * and centre against it. */}
        <ThemedText
          style={[Typography.navLabel, styles.tabLabel]}
          themeColor={isFocused ? 'text' : 'textSecondary'}
          numberOfLines={2}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const triggers = Children.toArray(props.children);

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <View style={styles.tabGroup}>{triggers.slice(0, LEFT_TAB_COUNT)}</View>
        <View style={{ width: FAB_CLEARANCE }} />
        <View style={styles.tabGroup}>{triggers.slice(LEFT_TAB_COUNT)}</View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  tabGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonPressable: {
    flex: 1,
    alignItems: 'center',
  },
  tabButtonView: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.half,
    borderRadius: Spacing.three,
  },
  tabLabel: {
    textAlign: 'center',
  },
});
