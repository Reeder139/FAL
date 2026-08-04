import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePhotoLightbox } from '@/components/photo-lightbox';
import { fetchAnglerCatches, type AnglerCatch } from '@/lib/catches';
import { formatWeightOz } from '@/lib/units';

/** Half the gutter between tiles — applied as padding on each cell and
 * cancelled by an equal negative margin on the grid, so the outer edges
 * stay flush with the rest of the column. */
const HALF_GUTTER = Spacing.half;

function CatchTile({ item }: { item: AnglerCatch }) {
  const theme = useTheme();
  const { showPhoto } = usePhotoLightbox();

  // Only catches that actually have a photo open — seeded and pre-in-app
  // catches show a fish outline, and tapping through to nothing would read
  // as broken.
  const openable = item.photoUrl !== null;
  const caption = [formatWeightOz(item.weightOz), item.venueName].filter(Boolean).join(' · ');

  return (
    <View style={styles.cell}>
      <Pressable
        disabled={!openable}
        onPress={() => item.photoUrl && showPhoto({ uri: item.photoUrl, caption })}
        accessibilityRole={openable ? 'button' : undefined}
        accessibilityLabel={openable ? `View ${caption} full size` : undefined}
        style={({ pressed }) => [styles.tile, { backgroundColor: theme.surfaceElevated }, pressed && styles.tilePressed]}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />
        ) : (
          // Catches logged before in-app photos (and the seeded test data)
          // have no hero image — show the tile anyway rather than dropping
          // the catch from the grid entirely.
          <View style={styles.photoFallback}>
            <Ionicons name="fish-outline" size={28} color={theme.textMuted} />
          </View>
        )}

        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <Text style={[Typography.caption, styles.weight, { color: theme.onPrimary }]} numberOfLines={1}>
            {formatWeightOz(item.weightOz)}
          </Text>
          {item.venueName && (
            <Text style={[Typography.caption, { color: theme.onPrimary }]} numberOfLines={1}>
              {item.venueName}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

export function CatchGrid({ anglerId }: { anglerId: string }) {
  const theme = useTheme();
  const [catches, setCatches] = useState<AnglerCatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnglerCatches(anglerId)
      .then((data) => {
        if (!cancelled) setCatches(data);
      })
      .catch(() => {
        if (!cancelled) setCatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [anglerId]);

  return (
    <View style={styles.section}>
      <Text style={[Typography.label, { color: theme.label }]}>
        All my catches{catches ? ` (${catches.length})` : ''}
      </Text>

      {catches === null ? (
        <ActivityIndicator color={theme.primary} style={styles.loading} />
      ) : catches.length === 0 ? (
        <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>No catches logged yet.</Text>
      ) : (
        <View style={styles.grid}>
          {catches.map((item) => (
            <CatchTile key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: 'stretch',
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Cancels the per-cell padding at the outer edges so the grid lines up
    // with the rest of the column.
    margin: -HALF_GUTTER,
  },
  loading: {
    marginVertical: Spacing.four,
  },
  cell: {
    // Thirds rather than a measured pixel width: percentage + padding is
    // deterministic on first paint, whereas an onLayout-driven width
    // renders nothing until the measurement lands (and didn't land at all
    // here on web).
    width: '33.333%',
    padding: HALF_GUTTER,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radii.sm,
    overflow: 'hidden',
  },
  tilePressed: {
    opacity: 0.7,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.one,
  },
  weight: {
    fontWeight: '700',
  },
});
