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
      <Text style={[Typography.bodySmall, { color: theme.text, fontWeight: '700' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function NationalLeagueScreen() {
  const theme = useTheme();
  // Header stats only — the table itself, including the free-member ghost
  // row, comes from LeagueTable.
  const [standings, setStandings] = useState<NationalStandings | null>(null);
  const [loading, setLoading] = useState(true);


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
        {/* Artwork banner goes here once supplied. */}
        <View style={styles.header}>
          <Text style={[Typography.h1, { color: theme.text }]}>National League</Text>
          {standings && (
            <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>{standings.seasonName}</Text>
          )}
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
                <Text style={[Typography.body, { color: theme.text }]}>Bragging rights</Text>
              </View>
            </View>

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
    marginBottom: Spacing.one,
  },
  infoStat: {
    gap: Spacing.half,
  },
  linkRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  link: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  linkPressed: {
    opacity: 0.7,
  },
  linkIcon: {
    width: NavIconSize,
    height: NavIconSize,
  },
});
