import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { Colors, Radii, Spacing } from '@/constants/theme';

/** Fraction of the card, from its top-right corner, treated as the close
 * button. Every card in this set has an X baked into the artwork at roughly
 * x 86-100%, y 0-14%, so this covers it with a little margin without
 * reaching into the headline. */
const CLOSE_HIT_FRACTION = 0.18;

type OverlayCardProps = {
  visible: boolean;
  onDismiss: () => void;
  source: ImageSourcePropType;
  /** The artwork's own aspect. These differ card to card, so it can't be a
   * constant — the prep scripts print it. */
  ratio: number;
  /** The artwork carries all its own text, so this is the only thing a
   * screen reader has to go on. */
  label: string;
  /** Tapping the card itself. Omit for cards that are only read — the
   * backdrop and the X still dismiss. */
  onPress?: () => void;
  /** Widest the card may be drawn. Cards meant to be read want more than
   * ones meant to be glanced at. */
  maxWidth?: number;
  /** Most of the viewport height the card may occupy. */
  maxHeightFraction?: number;
};

/**
 * A full-screen artwork card over a scrim: the shape shared by the
 * convert-to-paid prompts and the rules card.
 *
 * Deliberately an absolutely-positioned overlay rather than React Native's
 * Modal. On react-native-web, Modal portals its content into a div appended
 * to document.body — outside the #root container React attaches its
 * delegated listeners to — so no click inside it ever reaches React and
 * every control in the modal is inert. It renders and centres perfectly,
 * which is what makes it a trap.
 *
 * Mount it from (tabs)/_layout, after the tab bar and Catch button, so it
 * covers them. Rendered from inside a screen it would sit under both: the
 * bar is a sibling of the screen slot, so no z-index within the screen can
 * beat it.
 */
export function OverlayCard({
  visible,
  onDismiss,
  source,
  ratio,
  label,
  onPress,
  maxWidth = 440,
  maxHeightFraction = 0.78,
}: OverlayCardProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (!visible) return null;

  // Fit by width first, then pull back if that makes it too tall for the
  // screen. Doing it in this order keeps the card as large as it can be
  // without ever running off the top and bottom.
  let cardWidth = Math.min(windowWidth - Spacing.four * 2, maxWidth);
  let cardHeight = cardWidth / ratio;
  const maxHeight = windowHeight * maxHeightFraction;
  if (cardHeight > maxHeight) {
    cardHeight = maxHeight;
    cardWidth = cardHeight * ratio;
  }

  return (
    <View style={styles.root}>
      {/* Backdrop is a sibling of the card, not its parent. Nesting them
       * would mean a tap on the card ran the backdrop's handler too — on
       * react-native-web these are DOM clicks and they bubble — so tapping
       * the X would dismiss *and* fire the card's own action. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />

      <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
        {onPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}>
            <Image source={source} style={styles.image} resizeMode="contain" />
          </Pressable>
        ) : (
          <Image
            source={source}
            style={styles.image}
            resizeMode="contain"
            accessible
            accessibilityLabel={label}
          />
        )}

        {/* Sits over the artwork's own X. A sibling of the card's action for
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
