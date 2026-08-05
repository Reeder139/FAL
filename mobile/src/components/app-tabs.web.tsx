import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Children, type ReactNode } from 'react';
import { Image, Pressable, View, StyleSheet, type ImageSourcePropType } from 'react-native';

import { FAB_SIZE } from './catch-fab';
import { ThemedView } from './themed-view';

import { MaxContentWidth, NavDividerSize, NavIconSize, NavIconWide, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The raised Catch button floats centered over this bar (see catch-fab.tsx)
// — it isn't one of the TabTriggers below. Reserve a gap the same width as
// the FAB (plus its glow) in the middle of the tab row so it never sits on
// top of a real tab, splitting the triggers into a left/right group either
// side of it.
//
// The padding either side of FAB_SIZE is what separates the button from the
// two rules flanking it, since those sit hard against this gap's edges. At
// Spacing.two the rules cleared the button by 4px and read as boxing it in;
// Spacing.five gives them room to read as separators instead. Every pixel
// here comes off the tab groups, so it trades against icon width — see
// NavIconSize, which is already bounded by tab width rather than height.
const FAB_CLEARANCE = FAB_SIZE + Spacing.five;
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
          {/* Lands on the National League table — every angler in the season,
            * paid or free, in one standing. Divisions and the leaders board
            * were tabs of their own and are now links from that page. */}
          <TabTrigger name="league" href="/league" asChild>
            <TabButton icon={require('@/assets/images/nav/national-league.png')} label="League" />
          </TabTrigger>
          <TabTrigger name="activity" href="/activity" asChild>
            <TabButton
              icon={require('@/assets/images/nav/activity.png')}
              iconBox={NavIconWide}
              label="Activity"
            />
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
  /** Override for artwork whose aspect is far from square, so it can be given
   * a box matching the others by area. Must be the artwork's true dimensions,
   * not a square containing it — the bar's row height comes from the tallest
   * icon box, so slack here deepens the whole bar. Defaults to a NavIconSize
   * square. */
  iconBox?: { width: number; height: number };
};

export function TabButton({
  icon,
  label,
  iconBox = { width: NavIconSize, height: NavIconSize },
  isFocused,
  ...props
}: TabButtonProps) {
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
          style={[iconBox, !isFocused && styles.iconUnfocused]}
          resizeMode="contain"
        />
      </ThemedView>
    </Pressable>
  );
}

/** One of the hairlines between nav icons.
 *
 * `aria-hidden` because it's pure decoration: the tab list is a row of
 * buttons, and announcing four unlabelled separators between them adds
 * nothing a screen reader user can act on. */
function NavDivider() {
  const theme = useTheme();
  return <View aria-hidden style={[styles.divider, { backgroundColor: theme.borderStrong }]} />;
}

/** Drops a divider into each gap between siblings — n items, n-1 rules, and
 * nothing at either end (the ends are handled around the FAB instead). */
function withDividers(items: ReactNode[]): ReactNode[] {
  return items.flatMap((item, i) => (i === 0 ? [item] : [<NavDivider key={`divider-${i}`} />, item]));
}

export function CustomTabList(props: TabListProps) {
  const triggers = Children.toArray(props.children);

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {/* Both groups flex evenly, which is what keeps the gap between them
         * centred — the Catch FAB is centred on the viewport, not on the gap,
         * so the two only line up when the groups are the same width.
         *
         * With four tabs that split 2/2, so every tab is the same width too.
         * That wasn't true of the old five-tab bar: the left held 2 against
         * the right's 3, making right-hand tabs a third narrower and capping
         * how large the icons could go. Adding a tab back on either side
         * brings that constraint with it. */}
        {/* The two rules flanking the FAB gap sit outside the groups, as
         * siblings of the spacer, rather than at the groups' inner edges.
         * Placed inside they'd be pushed around by `space-evenly` and land
         * short of the gap; out here they're pinned to it — and being
         * symmetric, they leave the gap centred on the viewport, which is
         * what the FAB is centred on. */}
        <View style={styles.tabGroup}>{withDividers(triggers.slice(0, LEFT_TAB_COUNT))}</View>
        <NavDivider />
        <View style={{ width: FAB_CLEARANCE }} />
        <NavDivider />
        <View style={styles.tabGroup}>{withDividers(triggers.slice(LEFT_TAB_COUNT))}</View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    // No padding underneath, so the bar's bottom edge meets the bottom of
    // the screen instead of hovering above it. The horizontal inset stays —
    // that's what keeps the bar a centred pill rather than full-bleed.
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    // Square ends, not a pill. The bar sits flush to the bottom of the
    // screen, and a corner radius there curved the bottom two corners away
    // from the screen edge — leaving the background showing through at each
    // end of the edge it's supposed to be sitting on.
    borderRadius: 0,
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
  divider: {
    ...NavDividerSize,
    // Must not flex: these are hairlines, and letting the row shrink or
    // stretch them is the difference between a rule and a smudge.
    flexGrow: 0,
    flexShrink: 0,
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
  iconUnfocused: {
    opacity: 0.65,
  },
});
