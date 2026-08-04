import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

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
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

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

      <NativeTabs.Trigger name="national-league">
        <NativeTabs.Trigger.Label hidden>National League</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/national-league.png')}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="divisions">
        <NativeTabs.Trigger.Label hidden>Divisions</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/divisions.png')}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="leaders">
        <NativeTabs.Trigger.Label hidden>Leaders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/nav/leaders.png')}
          renderingMode="original"
        />
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
