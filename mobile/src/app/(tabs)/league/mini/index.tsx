import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import { TabScreen } from '@/components/tab-screen';
import {
  DivisionWash,
  MaxContentWidth,
  Radii,
  Spacing,
  Typography,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyMiniLeagues, joinMiniLeagueByCode, type MiniLeagueSummary } from '@/lib/miniLeagues';

/**
 * The mini leagues this angler is in.
 *
 * Scored on the national rule — every verified fish of the season, best five
 * in summer and three in winter, whoever caught it and whenever they joined.
 * A mini league is a private table between people who know each other with no
 * prize attached, so gating it on paid membership would make it a worse
 * version of the division, and gating it on join date would mean a league
 * started in August began with everyone on zero.
 */
export default function MiniLeaguesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [leagues, setLeagues] = useState<MiniLeagueSummary[] | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyMiniLeagues()
      .then((data) => {
        if (!cancelled) setLeagues(data);
      })
      .catch(() => {
        if (!cancelled) setLeagues([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const join = async () => {
    if (!code.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const id = await joinMiniLeagueByCode(code.trim());
      setCode('');
      router.push({ pathname: '/league/mini/[id]', params: { id } });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join that league.');
    } finally {
      setJoining(false);
    }
  };

  // Rendered on both the empty and the populated state: someone with a
  // code in their hand and no leagues yet is exactly who needs it most.
  const joinBox = (
    <View style={[styles.joinBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[Typography.label, { color: theme.label }]}>Got a code?</Text>
      <View style={styles.joinRow}>
        <View style={styles.joinField}>
          <FormField
            label=""
            value={code}
            onChangeText={setCode}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={6}
          />
        </View>
        <AppButton title="Join" onPress={join} loading={joining} disabled={!code.trim() || joining} />
      </View>
      {joinError && <Text style={[Typography.bodySmall, { color: theme.danger }]}>{joinError}</Text>}
    </View>
  );

  return (
    <TabScreen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.navigate('/league')}
          style={[styles.backButton, { backgroundColor: theme.surface }]}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Back to the national league table">
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[Typography.h1, { color: theme.text }]} numberOfLines={1}>
          Mini Leagues
        </Text>
      </View>

      {leagues === null ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : leagues.length === 0 ? (
        <View style={styles.emptyState}>
          {/* The answer the pill on the league page now relies on. That pill
            * is shown to everyone, so most people arriving here for the first
            * time will land on exactly this. */}
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            You aren&rsquo;t currently involved in any mini leagues
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Paid members can start one from their profile and invite anyone — paid or not.
          </Text>
          {joinBox}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
            Every verified fish counts here, whoever caught it and whenever they joined.
          </Text>

          {joinBox}

          {leagues.map((league) => (
            <Pressable
              key={league.id}
              onPress={() => router.push({ pathname: '/league/mini/[id]', params: { id: league.id } })}
              style={[styles.card, { borderColor: theme.primary }]}>
              <LinearGradient
                colors={[
                  withAlpha(theme.primary, DivisionWash.from),
                  withAlpha(theme.primary, DivisionWash.mid),
                  'transparent',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.wash}
              />
              <View style={styles.cardHeader}>
                <Ionicons name="trophy" size={22} color={theme.gold} />
                <View style={styles.cardTitleGroup}>
                  <Text style={[Typography.h2, { color: theme.text }]} numberOfLines={1}>
                    {league.name}
                  </Text>
                  <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                    {league.memberCount} {league.memberCount === 1 ? 'angler' : 'anglers'} ·{' '}
                    {league.seasonName}
                  </Text>
                </View>
                {league.isOwner && (
                  <View style={[styles.ownerBadge, { backgroundColor: theme.primary }]}>
                    <Text style={[Typography.caption, { color: theme.onPrimary }]}>Yours</Text>
                  </View>
                )}
              </View>
              {/* The code is how someone joins a league they were not invited
                * to at creation, so the owner needs to be able to read it out. */}
              <Text style={[Typography.caption, { color: theme.textMuted }]}>
                Join code {league.joinCode}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  joinBox: {
    // The empty state centres its children, so without this the box shrinks
    // to its label instead of filling the column.
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  joinField: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill — react-native-web wants a concrete
    // size here, same as the division cards.
    width: '100%',
    height: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardTitleGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  ownerBadge: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
});
