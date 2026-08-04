import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import { MaxContentWidth, Radii, Spacing, SuggestedFollowsRailHeight, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dismissSuggestion, fetchSuggestedFollows, type SuggestedFollowCard } from '@/lib/suggestedFollows';
import { ordinal } from '@/lib/units';

const DIVISION_COLOR_KEYS = ['divisionOne', 'divisionTwo', 'divisionThree'] as const;

// 4 full circles visible + a half one peeking, so it still reads as
// scrollable at a glance rather than looking like a complete, fixed row.
const VISIBLE_CARDS = 4.5;
const GAP = Spacing.three;
/** Ceiling on the column width, and so on the circle's diameter. Without
 * it a wide viewport divides its 800px column by 4.5 and produces a 156px
 * circle, which overflows the fixed rail height and squashes the text
 * beneath it to nothing. Past phone width the rail should show more
 * circles, not bigger ones. */
const MAX_CARD_WIDTH = 76;

function Card({ card, onDismiss }: { card: SuggestedFollowCard; onDismiss: (id: string) => void }) {
  const theme = useTheme();
  const accent =
    card.divisionRank !== null ? theme[DIVISION_COLOR_KEYS[(card.divisionRank - 1) % 3]] : theme.primary;

  return (
    <View style={styles.card}>
      {/* The avatar is the item now — no card chrome behind it, so the
       * circles read as a row of faces rather than a row of tiles. */}
      <View style={styles.avatarWrap}>
        {card.avatarUrl ? (
          <Image source={{ uri: card.avatarUrl }} style={[styles.avatar, { borderColor: theme.border }]} />
        ) : (
          <View
            style={[styles.avatar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          />
        )}
        <Pressable
          onPress={() => onDismiss(card.id)}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${card.username}`}
          hitSlop={Spacing.two}
          style={[styles.dismissButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <Ionicons name="close" size={11} color={theme.textMuted} />
        </Pressable>
      </View>

      <Text style={[Typography.caption, styles.username, { color: theme.text }]} numberOfLines={1}>
        {card.username}
      </Text>

      {card.divisionRank !== null && card.positionInDivision !== null && (
        <Text style={[Typography.caption, { color: accent }]} numberOfLines={1}>
          Div {card.divisionRank} · {ordinal(card.positionInDivision)}
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
  const cardWidth = Math.min(
    (containerWidth - GAP * Math.floor(VISIBLE_CARDS)) / VISIBLE_CARDS,
    MAX_CARD_WIDTH
  );

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
    gap: GAP,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  // Square box that the circle fills, so the avatar scales with the column
  // width rather than being a fixed size.
  avatarWrap: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: Spacing.half,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: Radii.circle,
    borderWidth: 1,
  },
  dismissButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: Radii.circle,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontWeight: '700',
  },
});
