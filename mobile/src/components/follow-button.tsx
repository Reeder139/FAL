import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { followAngler, unfollowAngler } from '@/lib/follows';

type FollowButtonProps = {
  anglerId: string;
  initialIsFollowing: boolean;
  size?: 'small' | 'medium';
  /** Fires immediately on tap (optimistic) and again if the call fails and
   * it reverts — lets a parent keep a follower_count display in sync. */
  onChange?: (isFollowing: boolean) => void;
};

export function FollowButton({ anglerId, initialIsFollowing, size = 'medium', onChange }: FollowButtonProps) {
  const theme = useTheme();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsFollowing(initialIsFollowing);
  }, [initialIsFollowing]);

  const toggle = async () => {
    if (busy) return;
    const next = !isFollowing;
    setIsFollowing(next);
    onChange?.(next);
    setBusy(true);
    try {
      if (next) await followAngler(anglerId);
      else await unfollowAngler(anglerId);
    } catch {
      setIsFollowing(!next);
      onChange?.(!next);
    } finally {
      setBusy(false);
    }
  };

  const small = size === 'small';

  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      style={[
        styles.button,
        small && styles.small,
        {
          backgroundColor: isFollowing ? theme.surfaceElevated : theme.primary,
          borderWidth: isFollowing ? 1 : 0,
          borderColor: theme.border,
        },
      ]}>
      <Text
        style={[
          small ? Typography.caption : Typography.bodySmall,
          { color: isFollowing ? theme.textMuted : theme.onPrimaryStrong, fontWeight: '700' },
        ]}>
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  small: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
});
