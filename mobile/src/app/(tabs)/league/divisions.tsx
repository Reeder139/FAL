import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { DivisionPrizeBanner } from '@/components/division-prize-banner';
import { TabScreen } from '@/components/tab-screen';
import {
  Colors,
  DivisionWash,
  MaxContentWidth,
  Radii,
  Spacing,
  Typography,
  withAlpha,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueOverview, formatPbRange, type DivisionOverview, type LeagueOverview } from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

/**
 * A card washed in its own division's colour.
 *
 * This used to sit on a photograph from a rotating set. The photos fought
 * the text — every one had a different distribution of light, so a scrim
 * dark enough for the worst of them flattened the rest, and the cards read
 * as three unrelated pictures rather than three ranks of one thing. Colour
 * does the job the photo was there for, and does it the same way every time.
 *
 * Colours stay pinned to the dark palette rather than following the theme:
 * the wash is a saturated accent, and white is the only thing that reads on
 * it in either mode.
 */
function DivisionCard({
  division,
  index,
}: {
  division: DivisionOverview;
  index: number;
}) {
  const router = useRouter();
  const accent = Colors.dark[DIVISION_COLOR_KEYS[index % DIVISION_COLOR_KEYS.length]];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/league/[id]', params: { id: division.id } })}
      style={[styles.card, { borderColor: accent }]}>
      {/* Diagonal so the colour has somewhere to come from, and gone before
        * the bottom of the card — the stats sit on plain dark surface, which
        * is what keeps them legible without a scrim over the whole thing. */}
      <LinearGradient
        colors={[withAlpha(accent, DivisionWash.from), withAlpha(accent, DivisionWash.mid), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.wash}
      />

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={[styles.rankBadge, { backgroundColor: accent }]}>
            <Text style={[Typography.h2, { color: Colors.dark.onPrimary }]}>{division.rank}</Text>
          </View>
          <View style={styles.cardTitleGroup}>
            <Text style={[Typography.h2, { color: Colors.dark.text }]}>{division.name}</Text>
            <Text style={[Typography.body, { color: accent }]}>
              {formatPbRange(division.minPbOz, division.maxPbOz)}
            </Text>
          </View>
          {division.isYourDivision && (
            <View style={[styles.yourDivisionBadge, { backgroundColor: accent }]}>
              <Text style={[Typography.caption, { color: Colors.dark.onPrimary }]}>Your division</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[Typography.label, { color: Colors.dark.label }]}>Anglers</Text>
            <Text style={[Typography.statValue, { color: Colors.dark.text }]}>{division.memberCount}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[Typography.label, { color: Colors.dark.label }]}>Top score</Text>
            <Text style={[Typography.statValue, { color: Colors.dark.text }]}>
              {division.topScore !== null ? division.topScore.toFixed(1) : '—'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function LeagueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [overview, setOverview] = useState<LeagueOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLeagueOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TabScreen>
      {/* Outside the loading/empty/loaded branches on purpose: the way back
        * should not depend on whether a season happens to be open, and the
        * title was otherwise written out twice and could drift. */}
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
          Divisions
        </Text>
      </View>

      {/* Outside the branches too: what a division is worth is true whether
        * or not a season is currently open. */}
      <View style={styles.prizeBanner}>
        <DivisionPrizeBanner />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : !overview ? (
        <View style={styles.emptyState}>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            No season is open right now
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Divisions will show up here once the next season starts.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Typography.body, { color: theme.textSecondary }]}>
            Three divisions, seeded by personal best at the start of {overview.seasonName} and
            locked for its duration.
          </Text>
          {overview.currentPbOz !== null && (
            <Text style={[Typography.bodySmall, { color: theme.label }]}>
              Your current PB: {formatWeightOz(overview.currentPbOz)}
            </Text>
          )}

          {overview.divisions.map((division, index) => (
            <DivisionCard
              key={division.id}
              division={division}
              index={index}
            />
          ))}

          <View style={[styles.reseedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[Typography.label, { color: theme.label }]}>Reseeding</Text>
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
              {overview.currentPbOz !== null && overview.nextDivisionName
                ? `Your current PB is ${formatWeightOz(overview.currentPbOz)} — this will put you in ${overview.nextDivisionName} next season!`
                : 'Divisions are reseeded at the start of each season based on your current personal best — it updates automatically the moment a verified catch beats it.'}
            </Text>
          </View>
        </ScrollView>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  /* Matches the content column's width and side padding so the arrow and the
   * cards below it share a left edge. */
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
  /* Matches the content column so the banner lines up with the cards. */
  prizeBanner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
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
    // The title moved up into the header, so the old top padding would now
    // read as a gap under it.
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill, same reason the photo needed it:
    // react-native-web wants a concrete size here.
    width: '100%',
    height: '100%',
  },
  cardContent: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radii.lg,
    // Keeps the wash inside the rounded corners.
    overflow: 'hidden',
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rankBadge: {
    width: Spacing.six,
    height: Spacing.six,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  yourDivisionBadge: {
    borderRadius: Radii.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  stat: {
    gap: Spacing.half,
  },
  reseedCard: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
