import { useRouter, type Href } from 'expo-router';
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
  MaxContentWidth,
  NavIconSize,
  Radii,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLeagueOverview, formatPbRange, type DivisionOverview, type LeagueOverview } from '@/lib/divisions';
import { formatWeightOz } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

/**
 * The national table and the leaders board used to be tabs of their own. The
 * bottom bar now carries a single League tab pointing here, so this is the
 * only way into either of them — without these two they'd be live routes
 * with nothing linking to them.
 */
function LeagueOption({
  href,
  icon,
  label,
  caption,
}: {
  href: Href;
  icon: ImageSourcePropType;
  label: string;
  caption: string;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.optionPressed,
      ]}>
      <Image source={icon} style={styles.optionIcon} resizeMode="contain" />
      <View style={styles.optionText}>
        <Text style={[Typography.h3, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={2}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}

function DivisionCard({ division, index }: { division: DivisionOverview; index: number }) {
  const theme = useTheme();
  const router = useRouter();
  const accent = theme[DIVISION_COLOR_KEYS[index % DIVISION_COLOR_KEYS.length]];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/divisions/[id]', params: { id: division.id } })}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: accent }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, { backgroundColor: accent }]}>
          <Text style={[Typography.h2, { color: theme.onPrimary }]}>{division.rank}</Text>
        </View>
        <View style={styles.cardTitleGroup}>
          <Text style={[Typography.h2, { color: theme.text }]}>{division.name}</Text>
          <Text style={[Typography.body, { color: accent }]}>
            {formatPbRange(division.minPbOz, division.maxPbOz)}
          </Text>
        </View>
        {division.isYourDivision && (
          <View style={[styles.yourDivisionBadge, { backgroundColor: accent }]}>
            <Text style={[Typography.caption, { color: theme.onPrimary }]}>Your division</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[Typography.label, { color: theme.label }]}>Anglers</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>{division.memberCount}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[Typography.label, { color: theme.label }]}>Top score</Text>
          <Text style={[Typography.statValue, { color: theme.text }]}>
            {division.topScore !== null ? division.topScore.toFixed(1) : '—'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function LeagueScreen() {
  const theme = useTheme();
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
      {loading ? (
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
          <View style={styles.optionsRow}>
            <LeagueOption
              href="/divisions/national-league"
              icon={require('@/assets/images/nav/national-league.png')}
              label="National League"
              caption="One table, every division"
            />
            <LeagueOption
              href="/divisions/leaders"
              icon={require('@/assets/images/nav/leaders.png')}
              label="Leaders"
              caption="Who's top right now"
            />
          </View>

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
            <DivisionCard key={division.id} division={division} index={index} />
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
  optionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionIcon: {
    width: NavIconSize,
    height: NavIconSize,
  },
  optionText: {
    flex: 1,
  },
  card: {
    borderRadius: Radii.lg,
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
