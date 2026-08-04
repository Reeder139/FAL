import { useRouter } from 'expo-router';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Radii, Spacing } from '@/constants/theme';

/**
 * Branded landing screen — the first thing a signed-out angler sees. The
 * actual credential forms live behind the two buttons (/login, /sign-up);
 * this screen deliberately collects nothing itself.
 *
 * Pinned to Colors.dark rather than useTheme(): the background artwork is
 * a fixed night-time scene, so a light-mode scrim/border would fight it.
 * This is the one screen whose palette is dictated by the art, not the
 * system setting.
 *
 * Every visible element except the scrim is pre-rendered artwork with its
 * text baked in (see scripts/prepare-login-assets.mjs), so each image
 * carries an explicit accessibilityLabel — a screen reader can't read
 * pixels.
 */

// Source aspect ratios, so nothing distorts as the column width changes.
const LOGO_RATIO = 1; // 2048x2048
const PRIZE_BOX_RATIO = 2400 / 1400;
const BUTTON_RATIO = 2400 / 600;
const BOTTOM_RAIL_RATIO = 2400 / 900;
// Shared with the tab template's strapline (see components/tag-line.tsx) —
// the same prepared asset, not a login-specific copy.
const TAGLINE_RATIO = 1320 / 67;

type ArtProps = {
  source: ImageSourcePropType;
  ratio: number;
  /** Omit for purely decorative art nested inside a labelled Pressable. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Width-driven artwork at a fixed aspect ratio.
 *
 * The ratio lives on a wrapper View rather than on the Image itself:
 * react-native-web writes an inline `height` onto the Image from the
 * source's intrinsic pixel size, which wins over an `aspectRatio` style
 * and renders every asset at its natural height. Letting the View own the
 * box and having the Image fill it behaves the same on native and web.
 */
function Art({ source, ratio, label, style }: ArtProps) {
  return (
    <View style={[{ width: '100%', aspectRatio: ratio }, style]}>
      <Image
        source={source}
        style={styles.fill}
        resizeMode="contain"
        accessible={label !== undefined}
        accessibilityRole={label !== undefined ? 'image' : undefined}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.background}>
      {/* Deliberately a plain absolutely-positioned Image rather than
       * ImageBackground: on react-native-web, ImageBackground never passes
       * resizeMode down to the inner <img>, which then falls back to the
       * source's intrinsic 1080x1920 anchored top-left — so on a desktop
       * viewport the scene covered only part of the width. Explicit
       * 100%/100% plus resizeMode here fills and centre-crops on both
       * platforms. */}
      <Image
        source={require('@/assets/images/login/background.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      {/* The art is already dark, but the crop shifts with viewport ratio —
       * this keeps contrast predictable behind the artwork regardless. */}
      <View style={styles.scrim} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <Art
            source={require('@/assets/images/login/logo.png')}
            ratio={LOGO_RATIO}
            label="Fantasy Fishing"
            style={styles.logo}
          />

          <Art
            source={require('@/assets/images/tagline.png')}
            ratio={TAGLINE_RATIO}
            label="Real anglers. Real fish. Real prizes."
            style={styles.tagline}
          />

          <Art
            source={require('@/assets/images/login/prize-box.png')}
            ratio={PRIZE_BOX_RATIO}
            label="Grand prize of £20,000, plus six £1,500 prizes for division winners, plus tackle bundles and vouchers for monthly competition winners."
          />

          {/* Lets the lake scene breathe between the prize box and the
           * buttons on tall screens; collapses first on short ones. */}
          <View style={styles.spacer} />

          <Pressable
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel="Log in"
            style={({ pressed }) => [styles.buttonPressable, pressed && styles.pressed]}>
            <Art source={require('@/assets/images/login/login-button.png')} ratio={BUTTON_RATIO} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/sign-up')}
            accessibilityRole="button"
            accessibilityLabel="Register"
            style={({ pressed }) => [styles.buttonPressable, pressed && styles.pressed]}>
            <Art source={require('@/assets/images/login/register-button.png')} ratio={BUTTON_RATIO} />
          </Pressable>

          <Art
            source={require('@/assets/images/login/bottom-rail.png')}
            ratio={BOTTOM_RAIL_RATIO}
            label="Real anglers, real competitions. Big prizes every season. Climb the leagues, be the best."
            style={styles.bottomRail}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Explicit dimensions matter: without them react-native-web sizes the
    // <img> from its intrinsic pixels instead of filling the container.
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dark.overlay,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  logo: {
    // The square source has generous transparent margin, so at full column
    // width it would eat most of the screen. This cap is also what keeps
    // the whole screen inside a typical phone viewport without scrolling —
    // it's the tallest element, so it's the one worth constraining.
    maxWidth: 230,
    alignSelf: 'center',
  },
  tagline: {
    // On top of the content container's own gap, so the strapline sits in a
    // slightly wider band than the artwork above and below it rather than
    // reading as part of the logo block.
    marginVertical: Spacing.one,
  },
  spacer: {
    flexGrow: 1,
    minHeight: Spacing.four,
  },
  buttonPressable: {
    width: '100%',
    borderRadius: Radii.md,
  },
  pressed: {
    opacity: 0.85,
  },
  bottomRail: {
    marginTop: Spacing.one,
  },
});
