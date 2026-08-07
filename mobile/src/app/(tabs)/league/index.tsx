import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { LeagueTable } from '@/components/league-table';
import { TabScreen } from '@/components/tab-screen';
import { MaxContentWidth, NavIconSize, Radii, Spacing, Typography } from '@/constants/theme';
import { fetchMyMiniLeagues } from '@/lib/miniLeagues';
import { useTheme } from '@/hooks/use-theme';
import { fetchNationalStandings, type NationalStandings } from '@/lib/divisions';

/**
 * Divisions and the leaders board used to be tabs of their own. The bottom
 * bar now carries a single League tab landing here, so these two links are
 * the only way into either — without them they'd be live routes with nothing
 * pointing at them.
 *
 * Deliberately a slim pill rather than the taller card treatment: this page's
 * table is the point, and every pixel spent above it is a row the angler
 * can't see without scrolling.
 */
function LeagueLink({
  href,
  icon,
  label,
}: {
  href: Href;
  icon: ImageSourcePropType;
  label: string;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.link,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.linkPressed,
      ]}>
      <Image source={icon} style={styles.linkIcon} resizeMode="contain" />
      {/* Two lines allowed: "Mini Leagues" does not fit a third of a 375px
        * row on one. The row stretches its children, so the taller pill sets
        * the height and all three stay level. */}
      <Text
        style={[Typography.bodySmall, styles.linkLabel, { color: theme.text, fontWeight: '700' }]}
        numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function NationalLeagueScreen() {
  const theme = useTheme();
  // Header stats only — the table itself, including the free-member ghost
  // row, comes from LeagueTable.
  const [inAMiniLeague, setInAMiniLeague] = useState(false);
  const [standings, setStandings] = useState<NationalStandings | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    fetchMyMiniLeagues()
      .then((leagues) => setInAMiniLeague(leagues.length > 0))
      .catch(() => setInAMiniLeague(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchNationalStandings()
      .then((data) => {
        if (!cancelled) setStandings(data);
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
      <View style={styles.content}>
        {/* Straight under the strapline and above the National League
          * heading: these are the ways out of this page, and burying them
          * under the season's stats meant scrolling past the thing you came
          * to read to find them.
          *
          * Outside the loading and empty branches too — Divisions and Mini
          * Leagues are worth reaching whether or not a season is running. */}
        <View style={styles.linkRow}>
          <LeagueLink
            href="/league/divisions"
            icon={require('@/assets/images/nav/divisions.png')}
            label="Divisions"
          />
          <LeagueLink
            href="/league/leaders"
            icon={require('@/assets/images/nav/leaders.png')}
            label="Leaders"
          />
          {/* Only once there is one to look at. A pill leading to an empty
            * page is a worse answer than no pill. */}
          {inAMiniLeague && (
            <LeagueLink
              href="/league/mini"
              icon={require('@/assets/images/nav/national-league.png')}
              label="Mini Leagues"
            />
          )}
        </View>

        <View style={styles.header}>
          {/* The season rides the title rather than sitting under it, so the
            * heading reads as one thing — "National League — Summer 2026" —
            * instead of a title with a stray date beneath it.
            *
            * A row that wraps, not a single Text: the season stays at
            * bodySmall against the title's h1, which a nested Text could do
            * but a wrap could not. If the pair ever outgrows the width, the
            * season drops to its own line whole rather than the dash
            * stranding itself at the end of the first. */}
          <View style={styles.titleRow}>
            <Text style={[Typography.h1, { color: theme.text }]}>National League</Text>
            {standings && (
              <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
                — {standings.seasonName}
              </Text>
            )}
          </View>
          {/* The counterpart to the divisional tables' gold line. Primary
            * rather than gold on purpose: gold means paid membership
            * throughout the app, and this is the league that doesn't need
            * it. At caption size it holds one line on a 360px phone. */}
          <Text style={[Typography.caption, { color: theme.primary }]}>
            All players&rsquo; best fish count in this league
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loading} />
        ) : !standings ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.h2, { color: theme.text, textAlign: 'center' }]}>
              No season is open right now
            </Text>
            <Text style={[Typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              The national table will fill up once the next season starts.
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.infoStrip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Anglers</Text>
                <Text style={[Typography.body, { color: theme.text }]}>{standings.memberCount}</Text>
              </View>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Top score</Text>
                <Text style={[Typography.body, { color: theme.text }]}>
                  {standings.rows[0] ? `${standings.rows[0].points.toFixed(1)} pts` : '—'}
                </Text>
              </View>
              <View style={styles.infoStat}>
                <Text style={[Typography.label, { color: theme.label }]}>Playing for</Text>
                <Text style={[Typography.body, { color: theme.text }]}>Top ten win prizes</Text>
              </View>
            </View>

            <LeagueTable divisionId={null} showDivisionBadge />
          </>
        )}
      </View>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    paddingVertical: Spacing.one,
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    // Baseline, not centre: the two sit on the same line of text, and
    // centring a 13px label against a 24px title floats it visibly high.
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.two,
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
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    // Deliberately wider than the gap below the link row: this is the seam
    // between the season's stats and the two navigation cards, so it should
    // read as a break between groups rather than as list spacing.
    marginBottom: Spacing.three,
  },
  infoStat: {
    gap: Spacing.half,
  },
  linkRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  link: {
    flex: 1,
    // Stacked, not side by side. Three of these share the row now, and at a
    // third of a 375px screen the label had about 45px next to the icon —
    // enough to truncate "Mini Leagues" to almost nothing. Beneath it, the
    // label gets the pill's full width.
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    // No longer a lozenge: at this height a 999 radius bows the sides in and
    // eats the corners the label needs.
    borderRadius: Radii.md,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  linkLabel: {
    textAlign: 'center',
  },
  linkPressed: {
    opacity: 0.7,
  },
  linkIcon: {
    width: NavIconSize,
    height: NavIconSize,
  },
});
