import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FollowButton } from '@/components/follow-button';
import {
  MaxContentWidth,
  paidRing,
  Radii,
  Spacing,
  SuggestedFollowsRailHeight,
  Typography,
} from '@/constants/theme';
import { useOpenAngler } from '@/hooks/use-open-angler';
import { useTheme } from '@/hooks/use-theme';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
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

function Card({
  card,
  onDismiss,
  isPaidMember,
}: {
  card: SuggestedFollowCard;
  onDismiss: (id: string) => void;
  isPaidMember: boolean;
}) {
  const theme = useTheme();
  const openAngler = useOpenAngler();
  const accent =
    card.divisionRank !== null ? theme[DIVISION_COLOR_KEYS[(card.divisionRank - 1) % 3]] : theme.primary;

  return (
    <View style={styles.card}>
      {/* The avatar is the item now — no card chrome behind it, so the
       * circles read as a row of faces rather than a row of tiles. They
       * still need an edge: at this size a hairline in `border` all but
       * vanishes, and anglers with no picture yet would be near-invisible
       * discs.
       *
       * That edge used to be gold on everyone, which was fine when gold
       * meant nothing. It now means paid member everywhere else in the
       * app, so a decorative gold ring here was telling anglers that every
       * suggestion was a paying one. Muted for everybody, gold only when
       * it is earned. */}
      <View style={styles.avatarWrap}>
        {/* The dismiss button below stays a sibling of this one, not a child.
         * Nested Pressables both fire on web, so dismissing would open the
         * profile of the angler you were dismissing. */}
        <Pressable
          onPress={() => openAngler(card.id)}
          accessibilityRole="link"
          accessibilityLabel={`View ${card.username}'s profile`}
          style={styles.avatarLink}>
          {card.avatarUrl ? (
            <Image
              source={{ uri: card.avatarUrl }}
              style={[
                styles.avatar,
                { borderColor: theme.textMuted },
                isPaidMember && paidRing(RAIL_AVATAR_SIZE, theme.gold),
              ]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.textMuted },
                isPaidMember && paidRing(RAIL_AVATAR_SIZE, theme.gold),
              ]}
            />
          )}
        </Pressable>
        <Pressable
          onPress={() => onDismiss(card.id)}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${card.username}`}
          hitSlop={Spacing.two}
          style={[styles.dismissButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <Ionicons name="close" size={11} color={theme.textMuted} />
        </Pressable>
      </View>

      <Pressable onPress={() => openAngler(card.id)} accessibilityRole="link">
        <Text style={[Typography.caption, styles.username, { color: theme.text }]} numberOfLines={1}>
          {card.username}
        </Text>
      </Pressable>

      {card.divisionRank !== null && card.positionInDivision !== null && (
        <Text style={[Typography.caption, { color: accent }]} numberOfLines={1}>
          Div {card.divisionRank} · {ordinal(card.positionInDivision)}
        </Text>
      )}

      <FollowButton anglerId={card.id} initialIsFollowing={false} size="small" />
    </View>
  );
}

/** The drawn diameter of a rail avatar, so the gold ring can scale to it.
 * The avatar fills its wrapper, which is capped at MAX_CARD_WIDTH. */
const RAIL_AVATAR_SIZE = 76;

export function SuggestedFollowsRail() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [cards, setCards] = useState<SuggestedFollowCard[] | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestedFollows()
      .then((found) => {
        setCards(found);
        void fetchPaidMemberIds(found.map((c) => c.id)).then(setPaidIds);
      })
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
            <Card card={card} onDismiss={handleDismiss} isPaidMember={paidIds.has(card.id)} />
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
  /** Must fill avatarWrap. The avatar below sizes itself at 100% of its
   * parent, so this link sitting between the two has to pass the box
   * through — left unsized it shrinks to its content, the avatar's 100%
   * resolves against nothing, and the circle collapses to its own 1px
   * border. */
  avatarLink: {
    width: '100%',
    height: '100%',
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
