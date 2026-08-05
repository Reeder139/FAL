import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addEvidencePhoto } from '@/lib/addEvidence';
import { fetchMyCatchesUnderReview, type CatchUnderReview } from '@/lib/catchReview';
import { formatDateInput } from '@/lib/dateInput';
import { formatWeightOz } from '@/lib/units';

/**
 * Tells an angler when one of their catches has been pulled for review, and
 * gives them the one action that can move it: adding evidence.
 *
 * Deliberately not silent. A catch under review has stopped scoring, and an
 * angler watching their total drop with no explanation will assume a bug —
 * so this says which fish, why if we can show a reason, and what to do.
 *
 * The reason itself reaches them through the support thread that
 * request_evidence() opens; catch_reviews is admin-gated, so this shows the
 * reason when it can read one and points at Support when it cannot.
 */
export function UnderReviewBanner() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<CatchUnderReview[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyCatchesUnderReview()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(load, [load]);

  if (items.length === 0) return null;

  const handleAddEvidence = async (catchId: string) => {
    setBusyId(catchId);
    try {
      const added = await addEvidencePhoto(catchId);
      if (added) {
        Alert.alert(
          'Evidence added',
          "Thanks — we'll take another look. Your reply is on the support thread if you want to add anything."
        );
      }
    } catch (e) {
      Alert.alert('Could not add that', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
      <View style={styles.headline}>
        <Ionicons name="alert-circle-outline" size={18} color={theme.gold} />
        <Text style={[Typography.h3, { color: theme.text }]}>
          {items.length === 1 ? 'A catch is under review' : `${items.length} catches are under review`}
        </Text>
      </View>

      <Text style={[Typography.bodySmall, { color: theme.textSecondary }]}>
        {items.length === 1 ? "It isn't scoring" : "They aren't scoring"} while we check. Adding a
        photo taken in the app is the quickest way to settle it.
      </Text>

      {items.map((item) => (
        <View key={item.catchId} style={[styles.item, { borderColor: theme.border }]}>
          <Text style={[Typography.bodySmall, { color: theme.text }]}>
            {formatWeightOz(item.weightOz)} · {formatDateInput(new Date(item.caughtAt))}
          </Text>
          {item.reason && (
            <Text style={[Typography.caption, { color: theme.textMuted }]}>{item.reason}</Text>
          )}
          <Pressable
            onPress={() => handleAddEvidence(item.catchId)}
            disabled={busyId === item.catchId}
            accessibilityRole="button"
            accessibilityLabel={`Add evidence for your ${formatWeightOz(item.weightOz)} catch`}
            style={[styles.action, { backgroundColor: theme.primary }]}>
            <Text style={[Typography.caption, styles.actionLabel, { color: theme.onPrimaryStrong }]}>
              {busyId === item.catchId ? 'OPENING CAMERA…' : 'ADD EVIDENCE'}
            </Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={() => router.push('/profile/support')} hitSlop={Spacing.two}>
        <Text style={[Typography.bodySmall, { color: theme.primary }]}>Read the full message →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  item: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  action: {
    alignSelf: 'flex-start',
    borderRadius: Radii.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  actionLabel: {
    fontWeight: '700',
  },
});
