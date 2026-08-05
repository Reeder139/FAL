import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyThreads, openThread, type SupportStatus, type SupportThread } from '@/lib/support';

const STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  waiting: 'Needs you',
  resolved: 'Resolved',
};

export default function SupportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyThreads()
      .then(setThreads)
      .catch(() => setThreads([]));
  }, []);

  useEffect(load, [load]);

  const statusColor = (status: SupportStatus) =>
    status === 'waiting' ? theme.gold : status === 'resolved' ? theme.textMuted : theme.primary;

  const handleSend = async () => {
    setError(null);
    setSending(true);
    try {
      const id = await openThread(subject.trim(), body.trim());
      setSubject('');
      setBody('');
      setComposing(false);
      router.push({ pathname: '/profile/support/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that just now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <TabScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={Spacing.two}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[Typography.h1, { color: theme.text }]}>Support</Text>
        </View>

        {composing ? (
          <View style={styles.form}>
            <FormField label="What's it about?" value={subject} onChangeText={setSubject} />
            <FormField
              label="Tell us what's happened"
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={5}
            />
            {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
            <AppButton
              title="Send"
              onPress={handleSend}
              loading={sending}
              disabled={!subject.trim() || !body.trim()}
            />
            <AppButton title="Cancel" variant="outline" onPress={() => setComposing(false)} />
          </View>
        ) : (
          <AppButton title="New request" onPress={() => setComposing(true)} />
        )}

        {threads === null ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : threads.length === 0 ? (
          <Text style={[Typography.body, styles.empty, { color: theme.textSecondary }]}>
            Nothing here yet. If something's wrong — a catch you can't explain, a score that looks
            off, anything at all — start a request and we'll pick it up.
          </Text>
        ) : (
          <View style={styles.list}>
            {threads.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/profile/support/[id]', params: { id: t.id } })}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.rowText}>
                  <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={2}>
                    {t.subject}
                  </Text>
                  <Text style={[Typography.caption, { color: theme.textMuted }]}>
                    {/* Staff-opened threads read as something asked of you,
                      * not something you asked — worth saying, because the
                      * evidence requests land here. */}
                    {t.openedByStaff ? 'From the FAL team' : 'Your request'}
                  </Text>
                </View>
                <View style={[styles.statusPill, { borderColor: statusColor(t.status) }]}>
                  <Text style={[Typography.caption, { color: statusColor(t.status) }]}>
                    {STATUS_LABEL[t.status]}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.two,
  },
  loading: {
    marginTop: Spacing.four,
  },
  empty: {
    marginTop: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
});
