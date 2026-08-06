import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import {
  DivisionWash,
  MaxContentWidth,
  Radii,
  Shadows,
  Spacing,
  Typography,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchAnglers, type AnglerSearchResult } from '@/lib/anglerSearch';
import { createMiniLeague, PaidMembersOnlyError } from '@/lib/miniLeagues';

const AVATAR_SIZE = 32;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * "Start a mini league" — the button and the sheet it opens.
 *
 * Not a react-native Modal. RN's Modal portals outside #root on
 * react-native-web, which puts it beyond the app's theming and layout and has
 * already caused trouble on this project; an absolutely-positioned overlay
 * inside the tree behaves the same on both platforms.
 *
 * The backdrop and the sheet are siblings rather than parent and child, so a
 * tap on the sheet cannot bubble to the backdrop and dismiss it — the same
 * shape every other overlay here uses.
 */
export function CreateMiniLeague({ canCreate }: { canCreate: boolean }) {
  const theme = useTheme();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnglerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invited, setInvited] = useState<AnglerSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    // Debounced: a search per keystroke is a request per keystroke, and the
    // answer for "ree" is never wanted once "reed" has been typed.
    const timer = setTimeout(() => {
      searchAnglers(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  const toggle = (angler: AnglerSearchResult) =>
    setInvited((prev) =>
      prev.some((a) => a.id === angler.id)
        ? prev.filter((a) => a.id !== angler.id)
        : [...prev, angler]
    );

  const close = () => {
    setOpen(false);
    setName('');
    setQuery('');
    setResults([]);
    setInvited([]);
    setError(null);
  };

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createMiniLeague(name.trim(), invited.map((a) => a.id));
      close();
      router.push({ pathname: '/league/mini/[id]', params: { id } });
    } catch (e) {
      setError(
        e instanceof PaidMembersOnlyError
          ? 'Only paid members can start a mini league.'
          : e instanceof Error
            ? e.message
            : 'Could not create that just now.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) return null;

  return (
    <>
      {/* The button. Gradient and glow rather than the standard outline: it
        * is the one thing on this screen that makes something new, and it
        * had to earn its place under the PB box rather than read as another
        * row of settings. */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Start a mini league"
        style={({ pressed }) => [styles.cta, { borderColor: theme.gold }, pressed && styles.pressed]}>
        <LinearGradient
          colors={[
            withAlpha(theme.gold, DivisionWash.from),
            withAlpha(theme.primary, DivisionWash.mid),
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.wash}
        />
        <Ionicons name="trophy" size={22} color={theme.gold} />
        <View style={styles.ctaText}>
          <Text style={[Typography.h3, { color: theme.text }]}>Start a mini league</Text>
          <Text style={[Typography.caption, { color: theme.textSecondary }]}>
            Invite your mates — paid or not — and settle it between you
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </Pressable>

      {open && (
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.raised]}>
            <View style={styles.sheetHeader}>
              <Text style={[Typography.h2, { color: theme.text }]}>New mini league</Text>
              <Pressable onPress={close} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <FormField label="League name" value={name} onChangeText={setName} placeholder="The Lake Crew" />

              <FormField
                label="Invite anglers"
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name"
                autoCapitalize="none"
              />

              {invited.length > 0 && (
                <View style={styles.chips}>
                  {invited.map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => toggle(a)}
                      style={[styles.chip, { backgroundColor: theme.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${a.username}`}>
                      <Text style={[Typography.caption, { color: theme.onPrimary }]}>{a.username}</Text>
                      <Ionicons name="close" size={12} color={theme.onPrimary} />
                    </Pressable>
                  ))}
                </View>
              )}

              {searching && <ActivityIndicator color={theme.primary} />}

              {results.map((angler) => {
                const picked = invited.some((a) => a.id === angler.id);
                return (
                  <Pressable
                    key={angler.id}
                    onPress={() => toggle(angler)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: picked }}
                    accessibilityLabel={`${picked ? 'Remove' : 'Invite'} ${angler.username}`}
                    style={[styles.result, { borderColor: picked ? theme.primary : theme.border }]}>
                    {angler.avatarUrl ? (
                      <Image source={{ uri: angler.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
                    )}
                    <Text style={[Typography.bodySmall, styles.resultName, { color: theme.text }]} numberOfLines={1}>
                      {angler.username}
                    </Text>
                    <Ionicons
                      name={picked ? 'checkmark-circle' : 'add-circle-outline'}
                      size={20}
                      color={picked ? theme.primary : theme.textMuted}
                    />
                  </Pressable>
                );
              })}

              {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}

              {/* Creating with nobody invited is allowed: the join code is on
                * the league's page, and reading it out is a perfectly good
                * way to fill a league. */}
              <AppButton
                title={invited.length > 0 ? `Create with ${invited.length} invited` : 'Create'}
                onPress={submit}
                loading={saving}
                disabled={!name.trim() || saving}
              />
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cta: {
    // The profile centres its children, so without this the card shrinks to
    // its text instead of filling the column like the rows around it.
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.8,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill — react-native-web wants a concrete
    // size here.
    width: '100%',
    height: '100%',
  },
  ctaText: {
    flex: 1,
    gap: Spacing.half,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    width: '92%',
    maxWidth: MaxContentWidth,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: Radii.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  sheetBody: {
    padding: Spacing.three,
    paddingTop: 0,
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.two,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radii.circle,
  },
  resultName: {
    flex: 1,
  },
});
