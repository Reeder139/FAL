import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { REPORT_REASONS, reportCatch, type ReportReasonId } from '@/lib/reports';
import { useAuth } from '@/providers/auth-provider';

/**
 * Reporting a catch.
 *
 * A modal, unlike comments — this one earns it. Comments are about the photo
 * you are looking at and belong beside it; a report is a deliberate act with
 * a decision in the middle of it, and the same shape as log-catch: open it,
 * finish it, dismiss it.
 */
export default function ReportCatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { catchId } = useLocalSearchParams<{ catchId: string }>();

  const [reasonId, setReasonId] = useState<ReportReasonId | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Redirect href="/welcome" />;

  const handleSend = async () => {
    if (!reasonId) return;
    setError(null);
    setSending(true);
    try {
      await reportCatch(catchId, reasonId, note);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that just now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={[Typography.h1, { color: theme.text }]}>Report this catch</Text>
            <Pressable onPress={() => router.back()} hitSlop={Spacing.two} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.text} />
            </Pressable>
          </View>

          {sent ? (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                Thanks — that's with the team. We look at every report, and we won't tell the angler
                who raised it.
              </Text>
              <AppButton title="Done" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Text style={[Typography.body, { color: theme.textSecondary }]}>
                What's wrong with it? Reports are private — the angler is never told who reported
                them.
              </Text>

              {REPORT_REASONS.map((r) => {
                const selected = reasonId === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setReasonId(r.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.reason,
                      { borderColor: selected ? theme.primary : theme.border },
                      selected && { backgroundColor: theme.surfaceElevated },
                    ]}>
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? theme.primary : theme.textMuted}
                    />
                    <Text style={[Typography.body, { color: theme.text }]}>{r.label}</Text>
                  </Pressable>
                );
              })}

              <FormField
                label="Anything else we should know? (optional)"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={4}
              />

              {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}

              <AppButton
                title="Send report"
                onPress={handleSend}
                loading={sending}
                disabled={!reasonId}
              />
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
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
});
