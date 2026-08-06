import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { MaxContentWidth, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchAnglers, type AnglerSearchResult } from '@/lib/anglerSearch';
import {
  addMiniLeagueMembers,
  deleteMiniLeague,
  removeMiniLeagueMember,
  renameMiniLeague,
  type MiniLeagueRow,
} from '@/lib/miniLeagues';

const AVATAR_SIZE = 32;
const SEARCH_DEBOUNCE_MS = 250;

type Props = {
  /** Controlled by the screen, which renders this outside its header.
   *
   * The sheet is position:absolute, and a React Native View is
   * position:relative by default — so rendered inside the header row it was
   * bounded by it, and `maxHeight: '85%'` resolved against about 60px. The
   * heading fitted and everything below it was clipped away. It has to be a
   * sibling of the header, not a child, which means the trigger and the
   * sheet live in different places and the open state belongs to the screen. */
  visible: boolean;
  onClose: () => void;
  miniLeagueId: string;
  leagueName: string;
  isOwner: boolean;
  members: MiniLeagueRow[];
  onChanged: () => void;
};

/**
 * Managing a mini league once it exists: rename, add, remove, delete — and
 * for everyone else, leave.
 *
 * Deleting asks twice. It takes the league away from everyone in it, not just
 * the person tapping, and there is no undo — mini_league_members cascades.
 */
export function ManageMiniLeague({ visible, onClose, miniLeagueId, leagueName, isOwner, members, onChanged }: Props) {
  const theme = useTheme();
  const router = useRouter();

  const [name, setName] = useState(leagueName);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnglerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(leagueName), [leagueName]);

  useEffect(() => {
    if (!visible || !isOwner) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchAnglers(term)
        .then((found) => setResults(found.filter((a) => !members.some((m) => m.anglerId === a.id))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, visible, isOwner, members]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    onClose();
    setQuery('');
    setResults([]);
    setConfirmingDelete(false);
    setError(null);
  };

  if (!visible) return null;

  return (
    <>
      {(
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.raised]}>
            <View style={styles.sheetHeader}>
              <Text style={[Typography.h2, { color: theme.text }]}>
                {isOwner ? 'Manage league' : 'League options'}
              </Text>
              <Pressable onPress={close} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {isOwner ? (
                <>
                  <FormField label="League name" value={name} onChangeText={setName} />
                  <AppButton
                    title="Save name"
                    variant="outline"
                    onPress={() => run(() => renameMiniLeague(miniLeagueId, name))}
                    disabled={busy || !name.trim() || name.trim() === leagueName}
                  />

                  <FormField
                    label="Add anglers"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by name"
                    autoCapitalize="none"
                  />
                  {searching && <ActivityIndicator color={theme.primary} />}
                  {results.map((angler) => (
                    <Pressable
                      key={angler.id}
                      onPress={() => run(async () => {
                        await addMiniLeagueMembers(miniLeagueId, [angler.id]);
                        setQuery('');
                      })}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${angler.username}`}
                      style={[styles.row, { borderColor: theme.border }]}>
                      {angler.avatarUrl ? (
                        <Image source={{ uri: angler.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
                      )}
                      <Text style={[Typography.bodySmall, styles.rowName, { color: theme.text }]} numberOfLines={1}>
                        {angler.username}
                      </Text>
                      <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
                    </Pressable>
                  ))}

                  <Text style={[Typography.label, { color: theme.label }]}>
                    Members ({members.length})
                  </Text>
                  {members.map((m) => (
                    <View key={m.anglerId} style={[styles.row, { borderColor: theme.border }]}>
                      {m.avatarUrl ? (
                        <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
                      )}
                      <Text style={[Typography.bodySmall, styles.rowName, { color: theme.text }]} numberOfLines={1}>
                        {m.username}
                      </Text>
                      {/* The owner is not removable — a league with nobody to
                        * administer it is worse than one with an owner who
                        * wanted out. They delete it below instead. */}
                      {m.isYou ? (
                        <Text style={[Typography.caption, { color: theme.textMuted }]}>Owner</Text>
                      ) : (
                        <Pressable
                          onPress={() => run(() => removeMiniLeagueMember(miniLeagueId, m.anglerId))}
                          hitSlop={Spacing.two}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${m.username}`}>
                          <Ionicons name="remove-circle-outline" size={20} color={theme.danger} />
                        </Pressable>
                      )}
                    </View>
                  ))}

                  <View style={[styles.dangerZone, { borderColor: theme.danger }]}>
                    {confirmingDelete ? (
                      <>
                        <Text style={[Typography.bodySmall, { color: theme.text }]}>
                          Delete &ldquo;{leagueName}&rdquo;? It goes for everyone in it, and cannot be
                          undone.
                        </Text>
                        <AppButton
                          title="Yes, delete it"
                          onPress={() =>
                            run(async () => {
                              await deleteMiniLeague(miniLeagueId);
                              close();
                              router.replace('/league/mini');
                            })
                          }
                          loading={busy}
                        />
                        <AppButton
                          title="Keep it"
                          variant="outline"
                          onPress={() => setConfirmingDelete(false)}
                        />
                      </>
                    ) : (
                      <AppButton
                        title="Delete league"
                        variant="outline"
                        onPress={() => setConfirmingDelete(true)}
                        disabled={busy}
                      />
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                    You&rsquo;re in {leagueName}. Leaving removes your row from its table — your
                    catches are untouched everywhere else.
                  </Text>
                  <AppButton
                    title="Leave this league"
                    variant="outline"
                    loading={busy}
                    onPress={() =>
                      run(async () => {
                        const me = members.find((m) => m.isYou);
                        if (me) await removeMiniLeagueMember(miniLeagueId, me.anglerId);
                        close();
                        router.replace('/league/mini');
                      })
                    }
                  />
                </>
              )}

              {error && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{error}</Text>}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: Radii.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  body: {
    padding: Spacing.three,
    paddingTop: 0,
    gap: Spacing.three,
  },
  row: {
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
  rowName: {
    flex: 1,
  },
  dangerZone: {
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
