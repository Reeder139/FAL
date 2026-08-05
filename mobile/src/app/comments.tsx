import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import { addComment, deleteComment, fetchComments, type PostComment } from '@/lib/comments';
import { useAuth } from '@/providers/auth-provider';

/**
 * Comments on one post.
 *
 * A modal at the root rather than a screen inside a tab, matching
 * search-anglers and log-catch: it is a focused thing you open, finish and
 * dismiss. The post id travels as a query param, not a path segment, so the
 * route stays static and needs no dynamic-route rewrite on the host.
 */
export default function CommentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const openAngler = useOpenAngler();
  const { session } = useAuth();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!postId) return;
    fetchComments(postId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [postId]);

  useEffect(load, [load]);

  if (!session) return <Redirect href="/welcome" />;

  const handleSend = async () => {
    setError(null);
    setSending(true);
    try {
      await addComment(postId, body);
      setBody('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post that just now.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic: the row goes immediately and comes back on the next load
    // if the delete failed. A comment that lingers after you tap remove
    // reads as the button not working.
    setComments((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    try {
      await deleteComment(id);
    } finally {
      load();
    }
  };

  const renderItem = ({ item }: { item: PostComment }) => (
    <View style={styles.comment}>
      <Pressable
        onPress={() => openAngler(item.authorId)}
        accessibilityRole="link"
        accessibilityLabel={`View ${item.username}'s profile`}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
        )}
      </Pressable>

      <View style={styles.commentBody}>
        <Pressable onPress={() => openAngler(item.authorId)} accessibilityRole="link">
          <Text style={[Typography.h3, { color: theme.text }]}>{item.username}</Text>
        </Pressable>
        <Text style={[Typography.body, { color: theme.text }]}>{item.body}</Text>
      </View>

      {/* Only your own. There is no report affordance here yet — flagging a
        * comment has no home in the admin console, and a button that files
        * nowhere is worse than none. */}
      {item.isMine && (
        <Pressable
          onPress={() => handleDelete(item.id)}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Delete your comment">
          <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
        </Pressable>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <Text style={[Typography.h2, { color: theme.text }]}>Comments</Text>
          <Pressable onPress={() => router.back()} hitSlop={Spacing.two} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>

        {comments === null ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[Typography.body, styles.empty, { color: theme.textSecondary }]}>
                No comments yet. Say something about the fish.
              </Text>
            }
          />
        )}

        <View style={[styles.composer, { borderColor: theme.border }]}>
          <FormField label="Add a comment" value={body} onChangeText={setBody} multiline numberOfLines={3} />
          {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
          <AppButton title="Post" onPress={handleSend} loading={sending} disabled={!body.trim()} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  loading: {
    marginTop: Spacing.four,
  },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  empty: {
    marginTop: Spacing.four,
    textAlign: 'center',
  },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: Radii.circle,
  },
  commentBody: {
    flex: 1,
    gap: Spacing.half,
  },
  composer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
    borderTopWidth: 1,
  },
});
