import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { CountryPicker } from '@/components/country-picker';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { DEFAULT_COUNTRY } from '@/constants/countries';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

const USERNAME_MIN_LENGTH = 3;

function sanitizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export default function SignUpScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [checkEmailMessage, setCheckEmailMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (username.length < USERNAME_MIN_LENGTH) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timeout = setTimeout(async () => {
      const { data, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (checkError) {
        setUsernameStatus('error');
        return;
      }
      setUsernameStatus(data ? 'taken' : 'available');
    }, 400);
    return () => clearTimeout(timeout);
  }, [username]);

  const usernameHint: Record<UsernameStatus, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: 'Checking…', color: theme.textMuted },
    available: { text: 'Available', color: theme.success },
    taken: { text: 'Already taken', color: theme.danger },
    error: { text: 'Could not check', color: theme.danger },
  };
  const hint = usernameHint[usernameStatus];

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    password === confirmPassword &&
    usernameStatus === 'available' &&
    displayName.trim().length > 0;

  const handleSignUp = async () => {
    setError(null);
    setCheckEmailMessage(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Country rides in the metadata because the profile row is written by
      // the on_auth_user_created trigger, not by this client — see
      // handle_new_user(), which copies it across.
      options: { data: { username, display_name: displayName.trim(), country } },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      // Email confirmation is required on this project — no session yet,
      // so there's nothing for the router to pick up until they confirm.
      setCheckEmailMessage('Check your email to confirm your account, then log in.');
      return;
    }

    // Session exists — AuthProvider picks it up, (auth)/_layout sends them to
    // the feed, and the tabs layout bounces them to /fair-play, which is
    // where registration actually completes.
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[Typography.h1, { color: theme.text }]}>Create your account</Text>

          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <FormField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            error={confirmPassword && password !== confirmPassword ? "Passwords don't match" : null}
          />
          <FormField
            label="Username"
            value={username}
            onChangeText={(text) => setUsername(sanitizeUsername(text))}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="lowercase, no spaces"
            labelAccessory={hint && <Text style={[Typography.caption, { color: hint.color }]}>{hint.text}</Text>}
          />
          <FormField label="Display name" value={displayName} onChangeText={setDisplayName} />
          {/* Not used for anything yet — leagues are UK-only. Collected now
            * because asking every existing member later is far harder than
            * asking each new one once. */}
          <CountryPicker label="Country" value={country} onChange={setCountry} />

          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
          {checkEmailMessage && (
            <Text style={[Typography.bodySmall, { color: theme.success }]}>{checkEmailMessage}</Text>
          )}

          <AppButton title="Sign up" onPress={handleSignUp} loading={loading} disabled={!canSubmit} />

          <View style={styles.footerRow}>
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>Already have an account?</Text>
            <Link href="/login">
              <Text style={[Typography.bodySmall, { color: theme.primary }]}> Log in</Text>
            </Link>
          </View>
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
});
