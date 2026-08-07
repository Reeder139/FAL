import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Children, type ReactNode } from 'react';
import { Image, Pressable, Text, View, StyleSheet, type ImageSourcePropType } from 'react-native';

import { FAB_SIZE } from './catch-fab';
import { ThemedView } from './themed-view';

import {
  MaxContentWidth,
  NavBadge,
  NavDividerSize,
  NavIconSize,
  Radii,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUnreadActivityCount } from '@/lib/activity';
import { emitTabReselect } from '@/lib/tabReselect';

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
  const unread = useUnreadActivityCount();

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton icon={require('@/assets/images/nav/feed.png')} label="Feed" tab="home" />
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
              label="Activity"
              badgeCount={unread}
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
  /** Unread items behind this tab. 0 or undefined draws nothing — an empty
   * badge is worse than no badge, because a permanent red dot stops meaning
   * anything. */
  badgeCount?: number;
  /** The tab's route name. Given only by tabs whose screen does something
   * when it is pressed a second time — see useTabReselect. */
  tab?: string;
};

export function TabButton({ icon, label, badgeCount = 0, tab, isFocused, onPress, ...props }: TabButtonProps) {
  const theme = useTheme();
  // Past 99 the exact number stops being information and starts being a
  // layout problem — the badge would be wider than the icon it sits on.
  const badge = badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <Pressable
      {...props}
      // Pressing the tab you are already on navigates to the route it is
      // already showing, so routing alone cannot express "back to the top".
      // The trigger's own handler still runs — it is a no-op here, and
      // swallowing it would break the press for every other case.
      onPress={(e) => {
        if (tab && isFocused) emitTabReselect(tab);
        onPress?.(e);
      }}
      accessibilityRole="tab"
      // The count belongs in the accessible name, not just the pixels: a
      // screen reader user gets "Activity, 3 unread" rather than "Activity"
      // and no idea there is anything waiting.
      accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} unread` : label}
      // aria-selected set directly rather than via accessibilityState:
      // react-native-web renders this trigger as an <a>, and the state prop
      // doesn't reach the DOM there — leaving a role="tab" with no selected
      // state, which is worse than no role at all.
      aria-selected={isFocused}
      style={({ pressed }) => [styles.tabButtonPressable, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <View style={styles.iconBox}>
          {/* Unfocused icons are dimmed rather than recoloured: the artwork is
           * full-colour gold, so tinting it to a "muted" token would fight the
           * asset. Opacity keeps the selected tab obvious while leaving every
           * icon recognisable. */}
          <Image
            source={icon}
            style={[styles.icon, !isFocused && styles.iconUnfocused]}
            resizeMode="contain"
          />
          {/* Outside the dimming, deliberately: an unread count is the one
            * thing on this bar that has to be as loud on the tab you are not
            * looking at as on the one you are. */}
          {badgeCount > 0 && (
            <View
              aria-hidden
              style={[
                styles.badge,
                { backgroundColor: theme.notification, borderColor: theme.backgroundElement },
              ]}>
              <Text style={[Typography.navLabel, styles.badgeText, { color: theme.onNotification }]}>
                {badge}
              </Text>
            </View>
          )}
        </View>
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
  // The badge anchors to this rather than to the tab button, so it tracks the
  // artwork's corner and not the padded box around it. RN Views are already
  // `position: relative`, which is what bounds the absolute child below.
  iconBox: {
    width: NavIconSize,
    height: NavIconSize,
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  iconUnfocused: {
    opacity: 0.65,
  },
  badge: {
    position: 'absolute',
    top: NavBadge.offsetTop,
    right: NavBadge.offsetRight,
    height: NavBadge.size,
    minWidth: NavBadge.minWidth,
    paddingHorizontal: NavBadge.paddingHorizontal,
    borderRadius: Radii.circle,
    borderWidth: NavBadge.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    textAlign: 'center',
  },
});
