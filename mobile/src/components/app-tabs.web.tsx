import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Children } from 'react';
import { Image, Pressable, View, StyleSheet, type ImageSourcePropType } from 'react-native';

import { FAB_SIZE } from './catch-fab';
import { ThemedView } from './themed-view';

import { MaxContentWidth, NavIconSize, Spacing } from '@/constants/theme';

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
            <TabButton icon={require('@/assets/images/nav/feed.png')} label="Feed" />
          </TabTrigger>
          <TabTrigger name="national-league" href="/national-league" asChild>
            <TabButton
              icon={require('@/assets/images/nav/national-league.png')}
              label="National League"
            />
          </TabTrigger>
          <TabTrigger name="divisions" href="/divisions" asChild>
            <TabButton icon={require('@/assets/images/nav/divisions.png')} label="Divisions" />
          </TabTrigger>
          <TabTrigger name="leaders" href="/leaders" asChild>
            <TabButton icon={require('@/assets/images/nav/leaders.png')} label="Leaders" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon={require('@/assets/images/nav/profile.png')} label="Profile" />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  icon: ImageSourcePropType;
  /** The tab's name. Not drawn — the artwork is the label now — but carried
   * as the accessible name, since a screen reader can't read a picture. */
  label: string;
};

export function TabButton({ icon, label, isFocused, ...props }: TabButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      // aria-selected set directly rather than via accessibilityState:
      // react-native-web renders this trigger as an <a>, and the state prop
      // doesn't reach the DOM there — leaving a role="tab" with no selected
      // state, which is worse than no role at all.
      aria-selected={isFocused}
      style={({ pressed }) => [styles.tabButtonPressable, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        {/* Unfocused icons are dimmed rather than recoloured: the artwork is
         * full-colour gold, so tinting it to a "muted" token would fight the
         * asset. Opacity keeps the selected tab obvious while leaving every
         * icon recognisable. */}
        <Image
          source={icon}
          style={[styles.icon, !isFocused && styles.iconUnfocused]}
          resizeMode="contain"
        />
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
    // Deeper than the old text labels needed, so the icons sit in the bar
    // with room around them rather than filling it edge to edge.
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.half,
    borderRadius: Spacing.three,
  },
  icon: {
    width: NavIconSize,
    height: NavIconSize,
  },
  iconUnfocused: {
    opacity: 0.65,
  },
});
