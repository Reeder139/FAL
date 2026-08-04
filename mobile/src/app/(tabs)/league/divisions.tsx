import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import {
  BottomTabInset,
  CardBackdropScrim,
  Colors,
  MaxContentWidth,
  Radii,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueOverview, formatPbRange, type DivisionOverview, type LeagueOverview } from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

/** Backdrops behind the division cards. Eight for three slots, so the page
 * doesn't look the same on every visit — see takeNextBackdropOffset. Built
 * by scripts/prepare-division-backdrops.mjs. */
const BACKDROPS: ImageSourcePropType[] = [
  require('@/assets/images/divisions/backdrop-01.jpg'),
  require('@/assets/images/divisions/backdrop-02.jpg'),
  require('@/assets/images/divisions/backdrop-03.jpg'),
  require('@/assets/images/divisions/backdrop-04.jpg'),
  require('@/assets/images/divisions/backdrop-05.jpg'),
  require('@/assets/images/divisions/backdrop-06.jpg'),
  require('@/assets/images/divisions/backdrop-07.jpg'),
  require('@/assets/images/divisions/backdrop-08.jpg'),
];

const BACKDROP_KEY = 'fal.divisionBackdropOffset';

/**
 * Where in the set this visit starts, advancing by three so the next visit
 * gets a fresh trio rather than two of the same.
 *
 * Persisted rather than random: random picks repeat often enough with eight
 * images that it reads as broken rather than varied, and an in-memory
 * counter would reset on every launch and show the same three each time.
 */
async function takeNextBackdropOffset(): Promise<number> {
  let offset = 0;
  try {
    const stored = await AsyncStorage.getItem(BACKDROP_KEY);
    const parsed = stored === null ? 0 : Number.parseInt(stored, 10);
    if (Number.isFinite(parsed) && parsed >= 0) offset = parsed % BACKDROPS.length;
    await AsyncStorage.setItem(BACKDROP_KEY, String((offset + 3) % BACKDROPS.length));
  } catch {
    // Non-critical — worst case every visit opens on the same trio.
  }
  return offset;
}

/**
 * The card's own text sits on a photograph, so its colours are pinned to the
 * dark palette rather than following the theme. The backdrops are darkened
 * to a common level by the prep script, which makes white-on-photo right in
 * both modes — a light-mode scrim over an already-dark image would land on
 * mid-grey and leave the dark text with nothing to sit against.
 */
function DivisionCard({
  division,
  index,
  backdrop,
}: {
  division: DivisionOverview;
  index: number;
  backdrop: ImageSourcePropType;
}) {
  const router = useRouter();
  const accent = Colors.dark[DIVISION_COLOR_KEYS[index % DIVISION_COLOR_KEYS.length]];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/league/[id]', params: { id: division.id } })}
      style={[styles.card, { borderColor: accent }]}>
      {/* Explicit width/height plus resizeMode rather than ImageBackground:
       * on react-native-web ImageBackground never passes resizeMode down, so
       * the picture renders at its natural size anchored top-left. */}
      <Image source={backdrop} style={styles.backdrop} resizeMode="cover" />
      <View style={styles.scrim} />

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
  const [overview, setOverview] = useState<LeagueOverview | null>(null);
  const [loading, setLoading] = useState(true);
  // Null until the rotation has been read, so the cards don't paint one trio
  // of backdrops and swap to another the moment storage answers.
  const [backdropOffset, setBackdropOffset] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    takeNextBackdropOffset().then((offset) => {
      if (!cancelled) setBackdropOffset(offset);
    });
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
      {loading || backdropOffset === null ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : !overview ? (
        <View style={styles.emptyState}>
          <Text style={[Typography.h1, { color: theme.text }]}>Divisions</Text>
          <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
            No season is open right now
          </Text>
          <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Divisions will show up here once the next season starts.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Typography.h1, { color: theme.text }]}>Divisions</Text>
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
              backdrop={BACKDROPS[(backdropOffset + index) % BACKDROPS.length]}
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
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit rather than absoluteFill: without a concrete size,
    // react-native-web sizes the img from its intrinsic pixels instead of
    // filling the card.
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CardBackdropScrim,
  },
  cardContent: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radii.lg,
    // Keeps the backdrop inside the rounded corners.
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
