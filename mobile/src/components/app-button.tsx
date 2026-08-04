import { ActivityIndicator, Pressable, Text, type GestureResponderEvent } from 'react-native';

import { ButtonVariants, Typography } from '@/constants/theme';

type Variant = keyof typeof ButtonVariants;

type AppButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Spoken name, when the visible title is too terse to stand alone out of
   * context — a screen reader announces the button without the layout around
   * it that makes a one-word label obvious. Defaults to the title. */
  accessibilityLabel?: string;
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityLabel,
}: AppButtonProps) {
  const v = ButtonVariants[variant];
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        backgroundColor: v.backgroundColor,
        borderRadius: v.borderRadius,
        paddingVertical: v.paddingVertical,
        paddingHorizontal: v.paddingHorizontal,
        borderWidth: isOutline ? ButtonVariants.outline.borderWidth : 0,
        borderColor: isOutline ? ButtonVariants.outline.borderColor : undefined,
        alignItems: 'center',
        opacity: disabled || loading ? 0.6 : 1,
      }}>
      {loading ? (
        <ActivityIndicator color={v.textColor} />
      ) : (
        <Text style={[Typography.button, { color: v.textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}
