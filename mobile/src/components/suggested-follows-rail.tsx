import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { MaxContentWidth, Radii, Spacing, SuggestedFollowsRailHeight, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dismissSuggestion, fetchSuggestedFollows, type SuggestedFollowCard } from '@/lib/suggestedFollows';
import { formatWeightOz, ordinal } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

// 5 full cards visible + the 6th peeking, so it reads as scrollable at a
// glance rather than looking like a complete, fixed row.
const VISIBLE_CARDS = 5.5;

function Card({ card, onDismiss }: { card: SuggestedFollowCard; onDismiss: (id: string) => void }) {
  const theme = useTheme();
  const accent =
    card.divisionRank !== null ? theme[DIVISION_COLOR_KEYS[(card.divisionRank - 1) % 3]] : theme.primary;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable
        onPress={() => onDismiss(card.id)}
        hitSlop={Spacing.two}
        style={[styles.dismissButton, { backgroundColor: theme.surfaceElevated }]}>
        <Ionicons name="close" size={12} color={theme.textMuted} />
      </Pressable>

      {card.avatarUrl ? (
        <Image source={{ uri: card.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
      )}

      <Text style={[Typography.caption, { color: theme.text, fontWeight: '700' }]} numberOfLines={1}>
        {card.username}
      </Text>

      {card.divisionRank !== null && card.positionInDivision !== null && (
        <Text style={[Typography.caption, { color: accent }]} numberOfLines={1}>
          Div {card.divisionRank} · {ordinal(card.positionInDivision)}
        </Text>
      )}

      {card.bestFishOz !== null && (
        <Text style={[Typography.caption, { color: theme.textMuted }]} numberOfLines={1}>
          {formatWeightOz(card.bestFishOz)}
        </Text>
      )}

      <FollowButton anglerId={card.id} initialIsFollowing={false} size="small" />
    </View>
  );
}

export function SuggestedFollowsRail() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [cards, setCards] = useState<SuggestedFollowCard[] | null>(null);

  useEffect(() => {
    fetchSuggestedFollows()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  const handleDismiss = (id: string) => {
    setCards((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    dismissSuggestion(id).catch(() => {
      // Best-effort persistence — worst case they see this card again next
      // load, which is harmless (dismiss is just a convenience, not a
      // safety property).
    });
  };

  if (!cards || cards.length === 0) return null;

  const containerWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 2;
  const cardWidth = (containerWidth - Spacing.two * Math.floor(VISIBLE_CARDS)) / VISIBLE_CARDS;

  return (
    <View style={styles.wrapper}>
      <Text style={[Typography.label, styles.title, { color: theme.label }]}>Suggested accounts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={{ height: SuggestedFollowsRailHeight }}>
        {cards.map((card) => (
          <View key={card.id} style={{ width: cardWidth }}>
            <Card card={card} onDismiss={handleDismiss} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  title: {
    marginBottom: Spacing.two,
  },
  scrollContent: {
    gap: Spacing.two,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  dismissButton: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    width: 18,
    height: 18,
    borderRadius: Radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: Spacing.five,
    height: Spacing.five,
    borderRadius: Radii.circle,
    marginBottom: Spacing.half,
  },
});
