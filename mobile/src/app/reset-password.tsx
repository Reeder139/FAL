import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/** Supabase's own floor. Rejecting short passwords here rather than after a
 * round trip keeps the error next to the field the user is typing in. */
const MIN_PASSWORD_LENGTH = 6;

type Stage = 'checking' | 'ready' | 'no-token' | 'done';

/**
 * Where a password-reset email lands.
 *
 * Deliberately NOT under `(auth)`. Redeeming a recovery link *creates a
 * session* — that is what authorises the password change — and
 * `(auth)/_layout` redirects anyone holding one straight to the feed. A
 * reset screen in that group would bounce to the app the instant its own
 * token worked, leaving the password unchanged and no way back in.
 *
 * The token is redeemed here rather than by `detectSessionInUrl`, which is
 * off (see lib/supabase). Both link shapes are handled: implicit flow, the
 * library default, puts an access/refresh pair in the URL fragment, while
 * PKCE puts a code in the query string. Supporting both means switching
 * flowType later cannot silently break password reset.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /** Drop the token out of the address bar once it's been redeemed, so it
     * isn't left sitting in history or a screenshot.
     *
     * Through the router rather than history.replaceState: called this
     * early, a raw replaceState is racing expo-router's own initial URL
     * sync, which then puts the fragment straight back. Verified — the same
     * call lands once the router has settled and does nothing before that. */
    const scrubUrl = () => {
      if (Platform.OS !== 'web') return;
      router.replace('/reset-password');
    };

    const consume = async () => {
      // Already signed in — either this is a signed-in angler changing their
      // password deliberately, or a token was redeemed on a previous render.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setStage('ready');
        return;
      }

      if (Platform.OS !== 'web') {
        setStage('no-token');
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);

      // Supabase reports a dead or already-used link this way rather than
      // by omitting the token, so it has to be read before anything else.
      if (hash.get('error') || query.get('error')) {
        setStage('no-token');
        return;
      }

      // Implicit flow — the default — puts the pair in the fragment.
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        scrubUrl();
        setStage(setErr ? 'no-token' : 'ready');
        return;
      }

      // PKCE flow puts a code in the query instead. Handled too, so that
      // turning flowType on later doesn't quietly break password reset.
      const code = query.get('code');
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        scrubUrl();
        setStage(exchangeErr ? 'no-token' : 'ready');
        return;
      }

      setStage('no-token');
    };

    consume();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSave = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStage('done');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[Typography.h1, { color: theme.text }]}>Choose a new password</Text>

          {stage === 'checking' && (
            <View style={styles.centre}>
              <ActivityIndicator color={theme.primary} />
            </View>
          )}

          {stage === 'no-token' && (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                This reset link has expired or has already been used. Request a new one and it'll be
                sent straight over.
              </Text>
              <AppButton title="Request a new link" onPress={() => router.replace('/forgot-password')} />
            </>
          )}

          {stage === 'ready' && (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                Pick something you'll remember — you'll be signed in straight afterwards.
              </Text>

              <FormField
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <FormField
                label="Confirm new password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
              />

              {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}

              <AppButton
                title="Save password"
                onPress={handleSave}
                loading={saving}
                disabled={!password || !confirm}
              />
            </>
          )}

          {stage === 'done' && (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                Password changed. You're signed in.
              </Text>
              {/* replace, not push: the recovery URL still carries a spent
                * token, and leaving it in history means Back lands on a dead
                * link. */}
              <AppButton title="Go to the app" onPress={() => router.replace('/')} />
            </>
          )}
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
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centre: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
});
