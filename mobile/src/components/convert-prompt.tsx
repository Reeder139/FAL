import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { Colors, Radii, Spacing } from '@/constants/theme';

type Prompt = {
  source: ImageSourcePropType;
  /** The card's own aspect. They differ, so this can't be one constant —
   * see scripts/prepare-convert-prompts.mjs, which prints these. */
  ratio: number;
  /** The artwork carries all its own text, so this is the only thing a
   * screen reader has to go on. */
  label: string;
};

const PROMPTS: Prompt[] = [
  {
    source: require('@/assets/images/convert/big-leagues.jpg'),
    ratio: 1187 / 1094,
    label:
      'Join the big leagues now to play for six divisional cash prizes and the grand prize of £20,000. Upgrade now and enter to win.',
  },
  {
    source: require('@/assets/images/convert/national-league.jpg'),
    ratio: 1200 / 1002,
    label:
      "You're playing in the National League with all members, but not in the big leagues for real prizes. Upgrade now to see where you would be placing and start playing for real prizes.",
  },
];

const ROTATION_KEY = 'fal.convertPromptIndex';

/**
 * Which card to show, advancing the rotation for next time.
 *
 * Persisted rather than held in memory because the prompt now appears once
 * per session: an in-memory counter would reset on every launch alongside it,
 * so the first card would win every session and the second would never be
 * seen. Storage is what makes the rotation actually rotate.
 */
async function takeNextPrompt(): Promise<Prompt> {
  let index = 0;
  try {
    const stored = await AsyncStorage.getItem(ROTATION_KEY);
    const parsed = stored === null ? 0 : Number.parseInt(stored, 10);
    if (Number.isFinite(parsed) && parsed >= 0) index = parsed % PROMPTS.length;
    await AsyncStorage.setItem(ROTATION_KEY, String((index + 1) % PROMPTS.length));
  } catch {
    // Non-critical — worst case the rotation restarts. Still show a card.
  }
  return PROMPTS[index];
}

/** Fraction of the card, from its top-right corner, treated as the close
 * button. Both cards have an X baked into the artwork at roughly x 86-100%,
 * y 0-14%, so this covers it with a little margin without reaching into the
 * headline. */
const CLOSE_HIT_FRACTION = 0.18;

/** Most of the viewport the card may occupy. It's a tall-ish card and the
 * phone it has to fit on is taller still, so height is usually what binds,
 * not width. */
const MAX_WIDTH = 440;
const MAX_HEIGHT_FRACTION = 0.78;

type ConvertPromptProps = {
  visible: boolean;
  onDismiss: () => void;
};

/**
 * Upsell card shown over the League tab to members who aren't in the paid
 * competition. Tapping the card goes to /join; tapping the backdrop, or the
 * X in the artwork, dismisses it.
 *
 * The two cards alternate on each appearance rather than one being picked at
 * random — random repeats itself often enough to look broken.
 *
 * Deliberately an absolutely-positioned overlay rather than React Native's
 * Modal. On react-native-web, Modal portals its content into a div appended
 * to document.body — outside the #root container React attaches its
 * delegated listeners to — so no click inside it ever reaches React and
 * every control in the modal is inert. It renders and looks correct, which
 * is what makes it a trap. This is mounted from (tabs)/_layout so it still
 * covers the tab bar and the Catch button.
 */
export function ConvertPrompt({ visible, onDismiss }: ConvertPromptProps) {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Null until the rotation has been read for this appearance, which is
  // what stops the first card flashing up and being swapped for the second
  // once storage answers.
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const wasVisible = useRef(false);

  // Take the next card on the transition into visible, not on every render —
  // otherwise a resize would advance the rotation and swap the card while
  // the angler is looking at it.
  useEffect(() => {
    let cancelled = false;
    if (visible && !wasVisible.current) {
      takeNextPrompt().then((next) => {
        if (!cancelled) setPrompt(next);
      });
    } else if (!visible) {
      setPrompt(null);
    }
    wasVisible.current = visible;
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleJoin = () => {
    onDismiss();
    router.push('/join');
  };

  if (!visible || !prompt) return null;

  // Fit by width first, then pull back if that makes it too tall for the
  // screen. Doing it in this order keeps the card as large as it can be
  // without ever running off the top and bottom.
  let cardWidth = Math.min(windowWidth - Spacing.four * 2, MAX_WIDTH);
  let cardHeight = cardWidth / prompt.ratio;
  const maxHeight = windowHeight * MAX_HEIGHT_FRACTION;
  if (cardHeight > maxHeight) {
    cardHeight = maxHeight;
    cardWidth = cardHeight * prompt.ratio;
  }

  return (
    <View style={styles.root}>
      {/* Backdrop is a sibling of the card, not its parent. Nesting them
       * would mean a tap on the card ran the backdrop's handler too — on
       * react-native-web these are DOM clicks and they bubble — so tapping
       * the X would dismiss *and* navigate. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />

      <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleJoin}
          accessibilityRole="button"
          accessibilityLabel={prompt.label}>
          <Image source={prompt.source} style={styles.image} resizeMode="contain" />
        </Pressable>

        {/* Sits over the artwork's own X. A sibling of the join target for
         * the same bubbling reason as the backdrop. */}
        <Pressable
          style={[
            styles.closeHit,
            { width: cardWidth * CLOSE_HIT_FRACTION, height: cardHeight * CLOSE_HIT_FRACTION },
          ]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Above the tab bar and the Catch button, which are its siblings in
    // (tabs)/_layout and would otherwise paint over the scrim.
    zIndex: 10,
    // Pinned rather than themed: this sits over the app, and a light-mode
    // scrim would leave the dark card floating on near-white.
    backgroundColor: Colors.dark.overlay,
  },
  card: {
    borderRadius: Radii.lg,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeHit: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
});
