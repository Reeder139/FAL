import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useUnreadActivityCount } from '@/lib/activity';

/**
 * Native (iOS/Android) bottom tab bar. The web build uses app-tabs.web.tsx
 * instead, which is a custom bar this app draws itself.
 *
 * Labels are `hidden` rather than removed: the artwork carries each tab's
 * name visually (see scripts/prepare-nav-icons.mjs), but the OS still uses
 * the Label as the tab's accessible name, so deleting it would leave
 * VoiceOver and TalkBack with nothing to announce.
 *
 * renderingMode="original" on every icon, not "template": these are
 * full-colour gold glyphs, and template mode would flatten each one to a
 * single tint and throw the artwork away.
 */
export default function AppTabs() {
  // Always dark, matching useTheme() — see the note there.
  const colors = Colors.dark;
  const unread = useUnreadActivityCount();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label hidden>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/feed.png')}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      {/* Lands on the National League table — every angler in the season,
       * paid or free, in one standing. Divisions and the leaders board were
       * tabs of their own and are now links from that page. */}
      <NativeTabs.Trigger name="league">
        <NativeTabs.Trigger.Label hidden>League</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/national-league.png')}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label hidden>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/activity.png')}
          renderingMode="original"
        />
        {/* The OS draws and places this one; the web bar draws its own. Hidden
          * rather than omitted at zero — an empty badge is a permanent red dot
          * that stops meaning anything. */}
        <NativeTabs.Trigger.Badge hidden={unread === 0}>
          {unread > 99 ? '99+' : String(unread)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label hidden>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/profile.png')}
          renderingMode="original"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
