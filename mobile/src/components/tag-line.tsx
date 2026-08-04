import { Image, StyleSheet, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Source dimensions of the prepared art (see scripts/prepare-tagline.mjs).
 * Cropped to its opaque content, so this is the artwork's own ratio rather
 * than a canvas the strapline happens to sit inside. */
const TAGLINE_RATIO = 1320 / 67;

/**
 * The "Real Anglers | Real Fish | Real Prizes" strapline that sits under the
 * League Position strip on every tab screen. Rendered by TabScreen, not by
 * the screens themselves — see that component for why the template owns
 * this rather than each page repeating it.
 *
 * Purely decorative to look at but not to a screen reader, which would
 * otherwise announce nothing at all here, so the wording is carried as an
 * accessibility label.
 */
export function TagLine() {
  return (
    <View style={styles.wrapper}>
      {/* The ratio sits on a wrapper View, not the Image: on
       * react-native-web an Image picks up an inline height from its
       * intrinsic pixel size, which overrides aspectRatio. The wrapper's
       * width is definite (a share of the content column), so the height
       * resolves from it with no circular dependency. */}
      <View style={styles.box}>
        <Image
          source={require('@/assets/images/tagline.png')}
          style={styles.image}
          resizeMode="contain"
          accessible
          accessibilityLabel="Real anglers. Real fish. Real prizes."
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    // Inset to the same edge as the strip's own text. The strip's border
    // runs full-bleed to the screen edges with its padding inside, so
    // matching that padding here lines the strapline up with the label
    // above it instead of with the border.
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  box: {
    width: '100%',
    aspectRatio: TAGLINE_RATIO,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
