import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { paidRing, Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnglerSearchResult } from '@/lib/anglerSearch';
import { searchWitnessCandidates } from '@/lib/witness';
import { useAuth } from '@/providers/auth-provider';

const AVATAR = 32;
const DEBOUNCE_MS = 300;

export type WitnessSelection = { id: string; username: string };

type WitnessPickerProps = {
  selection: WitnessSelection | null;
  onChange: (selection: WitnessSelection | null) => void;
};

/**
 * Nominating someone to vouch for a catch.
 *
 * Paid members only, and the picker says so rather than showing free members
 * greyed out: a name you cannot pick, with no way to change that, is a dead
 * end. A paid member has a season entry and a division and therefore
 * something to lose by vouching for an invented fish — which is the whole
 * reason the corroboration is worth anything.
 *
 * Optional by design and never pre-filled. A witness is a claim the angler
 * chooses to make, and a default would turn it into one they made by not
 * noticing.
 */
export function WitnessPicker({ selection, onChange }: WitnessPickerProps) {
  const theme = useTheme();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnglerSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (selection !== null) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchWitnessCandidates(trimmed, session?.user.id ?? null)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selection, session?.user.id]);

  if (selection) {
    return (
      <View style={styles.wrapper}>
        <Text style={[Typography.label, { color: theme.label }]}>Witness</Text>
        <View style={[styles.chosen, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.gold} />
          <Text style={[Typography.body, styles.chosenName, { color: theme.text }]} numberOfLines={1}>
            {selection.username}
          </Text>
          <Pressable
            onPress={() => {
              onChange(null);
              setQuery('');
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove witness"
            hitSlop={Spacing.two}>
            <Ionicons name="close" size={18} color={theme.textMuted} />
          </Pressable>
        </View>
        <Text style={[Typography.caption, { color: theme.textMuted }]}>
          They&rsquo;ll be asked to confirm they saw this fish and its weight.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <FormField
        label="Witness (optional)"
        value={query}
        onChangeText={setQuery}
        placeholder="Search paid members"
        autoCapitalize="none"
      />
      <Text style={[Typography.caption, { color: theme.textMuted }]}>
        Nominate a paid member who saw the catch. They confirm it from their Activity feed.
      </Text>

      {searching && <ActivityIndicator color={theme.primary} style={styles.loading} />}

      {!searching && results !== null && results.length === 0 && (
        <Text style={[Typography.caption, { color: theme.textMuted }]}>
          No paid members match that name. Only paid members can act as a witness.
        </Text>
      )}

      {!searching &&
        results?.map((angler) => (
          <Pressable
            key={angler.id}
            onPress={() => onChange({ id: angler.id, username: angler.username })}
            accessibilityRole="button"
            accessibilityLabel={`Nominate ${angler.username} as witness`}
            style={({ pressed }) => [
              styles.result,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            {angler.avatarUrl ? (
              <Image source={{ uri: angler.avatarUrl }} style={[styles.avatar, paidRing(AVATAR, theme.gold)]} />
            ) : (
              <View
                style={[styles.avatar, { backgroundColor: theme.surfaceElevated }, paidRing(AVATAR, theme.gold)]}
              />
            )}
            <Text style={[Typography.body, styles.resultName, { color: theme.text }]} numberOfLines={1}>
              {angler.username}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  loading: {
    alignSelf: 'flex-start',
  },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chosenName: {
    flex: 1,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: Radii.circle,
  },
  resultName: {
    flex: 1,
  },
});
