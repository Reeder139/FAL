import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { TabScreen } from '@/components/tab-screen';
import { BottomTabInset, MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchThreadMessages, replyToThread, type SupportMessage } from '@/lib/support';

export default function SupportThreadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetchThreadMessages(id)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [id]);

  useEffect(load, [load]);

  const handleReply = async () => {
    setError(null);
    setSending(true);
    try {
      await replyToThread(id, reply.trim());
      setReply('');
      load();
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
          <Text style={[Typography.h2, { color: theme.text }]}>Your request</Text>
        </View>

        {messages === null ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : (
          <View style={styles.thread}>
            {messages.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  m.isMine
                    ? { backgroundColor: theme.surfaceElevated, alignSelf: 'flex-end' }
                    : { backgroundColor: theme.surface, borderColor: theme.primary, borderWidth: 1 },
                ]}>
                {/* Staff replies are attributed to the team rather than to a
                  * person: the member is talking to FAL, and whoever picks
                  * the thread up next should not look like a new party. */}
                <Text style={[Typography.caption, { color: theme.label }]}>
                  {m.isMine ? 'You' : 'FAL team'}
                </Text>
                <Text style={[Typography.body, { color: theme.text }]}>{m.body}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.replyBox}>
          <FormField label="Reply" value={reply} onChangeText={setReply} multiline numberOfLines={4} />
          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
          <AppButton title="Send reply" onPress={handleReply} loading={sending} disabled={!reply.trim()} />
        </View>
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
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loading: {
    marginTop: Spacing.four,
  },
  thread: {
    gap: Spacing.two,
  },
  bubble: {
    maxWidth: '90%',
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  replyBox: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
