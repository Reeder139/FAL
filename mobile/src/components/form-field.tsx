import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { InputStyle, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  /** Rendered to the right of the label — e.g. a live-availability indicator. */
  labelAccessory?: React.ReactNode;
};

export function FormField({ label, error, labelAccessory, style, ...inputProps }: FormFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[Typography.label, { color: InputStyle.labelColor }]}>{label}</Text>
        {labelAccessory}
      </View>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          Typography.body,
          {
            backgroundColor: InputStyle.backgroundColor,
            borderColor: error ? theme.danger : InputStyle.borderColor,
            color: InputStyle.valueColor,
          },
          style,
        ]}
        {...inputProps}
      />
      {error && <Text style={[Typography.caption, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    borderWidth: InputStyle.borderWidth,
    borderRadius: InputStyle.borderRadius,
    paddingVertical: InputStyle.paddingVertical,
    paddingHorizontal: InputStyle.paddingHorizontal,
  },
});
