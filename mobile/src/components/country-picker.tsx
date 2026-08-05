import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COUNTRIES, countryName } from '@/constants/countries';
import { InputStyle, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** How tall the open list gets before it scrolls. Roughly five rows — enough
 * to show there is more below without the list swallowing the form. */
const LIST_MAX_HEIGHT = 220;

type CountryPickerProps = {
  label: string;
  value: string;
  onChange: (code: string) => void;
};

/**
 * Country selector for the sign-up form.
 *
 * Expands in place rather than opening a modal. Sign-up is a single flow, and
 * a full-screen takeover to answer one of five fields loses the angler their
 * place in it — the same reason comments went inline.
 */
export function CountryPicker({ label, value, onChange }: CountryPickerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[Typography.label, { color: theme.label }]}>{label}</Text>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Country: ${countryName(value)}. Tap to change.`}
        style={[
          styles.field,
          {
            backgroundColor: InputStyle.backgroundColor,
            borderColor: open ? theme.primary : InputStyle.borderColor,
            borderRadius: InputStyle.borderRadius,
          },
        ]}>
        <Text style={[Typography.body, styles.value, { color: theme.text }]}>{countryName(value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </Pressable>

      {open && (
        <ScrollView
          style={[styles.list, { borderColor: theme.border, backgroundColor: theme.surface }]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          {COUNTRIES.map((c) => {
            const selected = c.code === value;
            return (
              <Pressable
                key={c.code}
                onPress={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.row, selected && { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[Typography.body, { color: selected ? theme.primary : theme.text }]}>
                  {c.name}
                </Text>
                {selected && <Ionicons name="checkmark" size={16} color={theme.primary} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  value: {
    flex: 1,
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
    borderWidth: 1,
    borderRadius: Radii.md,
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
