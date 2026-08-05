import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { absoluteUrl } from '@/lib/siteUrl';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    // redirectTo only when a site URL is configured. Left off, Supabase
    // falls back to the Site URL set in its own dashboard, which is the
    // behaviour this had before and is still correct.
    //
    // Whatever EXPO_PUBLIC_SITE_URL is set to MUST also be on Supabase's
    // redirect allow-list (Authentication -> URL Configuration), or it
    // rejects the link and reset stops working entirely.
    const redirectTo = absoluteUrl('/reset-password');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo ? { redirectTo } : undefined
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[Typography.h1, { color: theme.text }]}>Reset your password</Text>
          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            Enter the email you signed up with — we'll send a link to reset your password.
          </Text>

          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
          {sent && (
            <Text style={[Typography.bodySmall, { color: theme.success }]}>
              Check your email for a reset link.
            </Text>
          )}

          <AppButton title="Send reset link" onPress={handleSubmit} loading={loading} disabled={!email} />

          <Link href="/login" style={styles.link}>
            <Text style={[Typography.bodySmall, { color: theme.primary }]}>Back to log in</Text>
          </Link>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  link: {
    alignSelf: 'center',
    marginTop: Spacing.three,
  },
});
