import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { FollowButton } from '@/components/follow-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchAnglers, type AnglerSearchResult } from '@/lib/anglerSearch';
import { useAuth } from '@/providers/auth-provider';

/** Matches the venue picker's debounce. Long enough that typing a name
 * doesn't fire a query per keystroke, short enough that the list feels like
 * it's keeping up. */
const DEBOUNCE_MS = 300;
/** Below this the query matches most of the membership, so the list would be
 * noise rather than an answer. Kept in step with searchAnglers, which
 * returns [] for anything shorter. */
const MIN_QUERY_LENGTH = 2;

function ResultRow({ angler }: { angler: AnglerSearchResult }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {angler.avatarUrl ? (
        <Image source={{ uri: angler.avatarUrl }} style={[styles.avatar, { borderColor: theme.border }]} />
      ) : (
        <View
          style={[styles.avatar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
        />
      )}

      {/* Takes the slack between the avatar and the button, so the button
       * lands hard against the right edge whatever the name's length. */}
      <View style={styles.names}>
        <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
          {angler.displayName}
        </Text>
        <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
          @{angler.username}
        </Text>
      </View>

      <FollowButton anglerId={angler.id} initialIsFollowing={angler.isFollowing} size="small" />
    </View>
  );
}

/**
 * Find other members by name.
 *
 * Presented as a modal (see _layout.tsx) rather than nested in the feed's
 * stack: it's a focused single-task flow that you finish and dismiss, the
 * same shape as log-catch, and the tab bar being hidden while it's open is
 * the point rather than a side effect.
 */
export default function SearchAnglersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnglerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Distinguishes "nothing typed yet" from "searched and found nobody" —
   * without it the empty list reads as no matches before you've searched. */
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      setError(null);
      return;
    }

    setSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const found = await searchAnglers(trimmed);
        if (cancelled) return;
        setResults(found);
        setError(null);
      } catch {
        if (cancelled) return;
        setResults([]);
        setError("Couldn't run that search — check your connection and try again.");
      } finally {
        if (!cancelled) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  if (authLoading) {
    return (
      <View style={[styles.flex, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[Typography.h1, { color: theme.text }]}>Find members</Text>
            <Pressable onPress={() => router.back()} hitSlop={Spacing.two}>
              <Text style={[Typography.body, { color: theme.primary }]}>Close</Text>
            </Pressable>
          </View>

          <FormField
            label="Search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or username"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            labelAccessory={
              searching ? <Text style={[Typography.caption, { color: theme.textMuted }]}>Searching…</Text> : null
            }
            error={error}
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ResultRow angler={item} />}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
          ListEmptyComponent={
            searching ? null : (
              <Text style={[Typography.body, styles.emptyText, { color: theme.textSecondary }]}>
                {tooShort
                  ? `Keep typing — ${MIN_QUERY_LENGTH} characters or more`
                  : searched
                    ? 'No members match that name'
                    : 'Search for another member by their name or username'}
              </Text>
            )
          }
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    width: '100%',
  },
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radii.circle,
    borderWidth: 1,
  },
  names: {
    flex: 1,
  },
  separator: {
    height: 1,
  },
  emptyText: {
    textAlign: 'center',
    paddingTop: Spacing.four,
  },
});
