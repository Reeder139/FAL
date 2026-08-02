import { ActivityIndicator, Pressable, Text, type GestureResponderEvent } from 'react-native';

import { ButtonVariants, Typography } from '@/constants/theme';

type Variant = keyof typeof ButtonVariants;

type AppButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
};

export function AppButton({ title, onPress, variant = 'primary', disabled, loading }: AppButtonProps) {
  const v = ButtonVariants[variant];
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
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
