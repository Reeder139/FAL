import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MediaRole } from '@/lib/catchPhoto';

export interface PhotoStripItem {
  id: string;
  uri: string;
  role: MediaRole;
  preparing: boolean;
  error: string | null;
}

type PhotoRoleStripProps = {
  photos: PhotoStripItem[];
  onSelectHero: (id: string) => void;
  onToggleEvidence: (id: string) => void;
  onRemove: (id: string) => void;
};

const THUMB_SIZE = Spacing.six;

export function PhotoRoleStrip({ photos, onSelectHero, onToggleEvidence, onRemove }: PhotoRoleStripProps) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {photos.map((photo) => (
        <View key={photo.id} style={styles.item}>
          <Pressable onPress={() => onSelectHero(photo.id)}>
            <View
              style={[
                styles.thumbWrapper,
                {
                  borderColor: photo.role === 'hero' ? theme.primary : theme.border,
                  borderWidth: photo.role === 'hero' ? 2 : 1,
                },
              ]}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} />
              {photo.preparing && (
                <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
                  <ActivityIndicator color={theme.primary} size="small" />
                </View>
              )}
              {photo.role === 'hero' && (
                <View style={[styles.heroBadge, { backgroundColor: theme.primary }]}>
                  <Text style={[Typography.caption, { color: theme.onPrimary }]}>Hero</Text>
                </View>
              )}
            </View>
          </Pressable>

          {photo.error && (
            <Text style={[Typography.caption, { color: theme.danger }]} numberOfLines={2}>
              {photo.error}
            </Text>
          )}

          <View style={styles.actionsRow}>
            {photo.role !== 'hero' && (
              <Pressable onPress={() => onToggleEvidence(photo.id)}>
                <Text style={[Typography.caption, { color: photo.role === 'evidence' ? theme.primary : theme.textMuted }]}>
                  {photo.role === 'evidence' ? 'Evidence' : 'Mark evidence'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => onRemove(photo.id)}>
              <Text style={[Typography.caption, { color: theme.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  item: {
    width: THUMB_SIZE,
    gap: Spacing.half,
  },
  thumbWrapper: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    left: Spacing.half,
    bottom: Spacing.half,
    borderRadius: Radii.xs,
    paddingHorizontal: Spacing.one,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
