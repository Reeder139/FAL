import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PostVisibility } from '@/lib/submitCatch';

/** Plain-English labels over posts.visibility — never show the enum values
 * themselves in the UI. */
const OPTIONS: { value: PostVisibility; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: 'Everyone' },
  { value: 'followers', label: 'Followers', description: 'People who follow you' },
  { value: 'league_only', label: 'My division', description: 'Anglers in your division' },
  { value: 'hidden', label: 'Private', description: 'Only you' },
];

type VisibilityPickerProps = {
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
};

export function VisibilityPicker({ value, onChange }: VisibilityPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[Typography.h2, { color: theme.text }]}>Who can see this</Text>
      <View style={styles.optionsList}>
        {OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.option,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.surfaceElevated : 'transparent',
                },
              ]}>
              <View style={[styles.radio, { borderColor: active ? theme.primary : theme.textMuted }]}>
                {active && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}
              </View>
              <View style={styles.optionText}>
                <Text style={[Typography.body, { color: theme.text }]}>{opt.label}</Text>
                <Text style={[Typography.caption, { color: theme.textMuted }]}>{opt.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  optionsList: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: Radii.circle,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: Radii.circle,
  },
  optionText: {
    gap: 1,
  },
});
