/**
 * FAL design system — the single source of truth for color, type, spacing,
 * radius and shadow tokens. Extracted from the approved app mockups.
 *
 * Every screen and component must build its styles from these exports.
 * No hardcoded hex colors, font sizes, or spacing numbers in screen code —
 * see DESIGN.md for the full rationale and visual reference.
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

// ---------------------------------------------------------------------------
// PALETTE — raw, named brand colors. Screens should not reference these
// directly; go through the semantic `Colors` map below so light/dark mode
// stays correct. Palette exists so every hex value has exactly one name,
// documented in DESIGN.md.
// ---------------------------------------------------------------------------
export const Palette = {
  // Ink (dark-mode neutrals)
  midnight: '#070D14',
  deepWater: '#0C141F',
  surfaceDark: '#121C2B',
  surfaceElevatedDark: '#1B2839',
  borderDark: '#293A4F',
  mutedDark: '#4A5C73',

  // Cloud (light-mode neutrals)
  cloudWhite: '#F4F8FC',
  pureWhite: '#FFFFFF',
  borderLight: '#DCE6F0',
  borderLightStrong: '#B9CAD9',
  inkNavy: '#0F2A43',
  slate: '#5B6B7C',

  // Text
  mist: '#A9B8C9',
  slateMuted: '#6E7F94',

  // Brand cyan (primary accent, dark mode)
  anglerCyan: '#22D3EE',
  cyanMist: '#67E0F2',
  deepCyan: '#0E93AD',

  // Brand purple (secondary accent — Division 2, vote/social actions)
  royalPurple: '#8B5CF6',
  deepViolet: '#5B21B6',
  lilac: '#C4B5FD',

  // Status
  successGreen: '#34D399',
  deepGreen: '#0F9D6B',
  alertRed: '#F87171',
  alertRedLight: '#D64545',

  // Division colors (Division 1 / 2 / 3 are always blue / purple / green)
  divisionBlue: '#3B82F6',
  deepBlue: '#1E3A8A',

  // Rank / prize colors
  championGold: '#F5B93F',
  championGoldLight: '#C98A1F',
  silver: '#B8C4D0',
  silverLight: '#8C99A6',
  bronze: '#C97F45',
  bronzeLight: '#A8632E',

  // Light-mode primary accent (deeper blue reads better on white than cyan)
  oceanBlue: '#1E88E5',
  oceanBlueDeep: '#125EA3',
} as const;

// ---------------------------------------------------------------------------
// COLORS — semantic tokens. This is what screens actually import.
// ---------------------------------------------------------------------------
export const Colors = {
  dark: {
    // base (kept for compatibility with ThemedView/ThemedText `type` props)
    text: Palette.pureWhite,
    background: Palette.midnight,
    backgroundElement: Palette.surfaceDark,
    backgroundSelected: Palette.surfaceElevatedDark,
    textSecondary: Palette.mist,

    // expanded semantic tokens
    surface: Palette.surfaceDark,
    surfaceElevated: Palette.surfaceElevatedDark,
    border: Palette.borderDark,
    borderStrong: Palette.mutedDark,
    textMuted: Palette.slateMuted,
    label: Palette.cyanMist,
    overlay: 'rgba(7,13,20,0.72)',

    primary: Palette.anglerCyan,
    primaryPressed: Palette.deepCyan,
    onPrimary: Palette.pureWhite,
    /** Dark-navy text for surfaces filled with `primary` — anglerCyan is
     * bright enough that white text reads poorly on it (see the League
     * summary strip). */
    onPrimaryStrong: Palette.inkNavy,

    secondary: Palette.royalPurple,
    secondaryPressed: Palette.deepViolet,
    onSecondary: Palette.pureWhite,

    success: Palette.successGreen,
    danger: Palette.alertRed,

    divisionOne: Palette.divisionBlue,
    divisionTwo: Palette.royalPurple,
    divisionThree: Palette.successGreen,

    gold: Palette.championGold,
    silver: Palette.silver,
    bronze: Palette.bronze,
  },
  light: {
    text: Palette.inkNavy,
    background: Palette.cloudWhite,
    backgroundElement: Palette.pureWhite,
    backgroundSelected: '#E7F1FB',
    textSecondary: Palette.slate,

    surface: Palette.pureWhite,
    surfaceElevated: Palette.pureWhite,
    border: Palette.borderLight,
    borderStrong: Palette.borderLightStrong,
    textMuted: Palette.slate,
    label: Palette.oceanBlueDeep,
    overlay: 'rgba(15,42,67,0.45)',

    primary: Palette.oceanBlue,
    primaryPressed: Palette.oceanBlueDeep,
    onPrimary: Palette.pureWhite,
    onPrimaryStrong: Palette.inkNavy,

    secondary: Palette.royalPurple,
    secondaryPressed: Palette.deepViolet,
    onSecondary: Palette.pureWhite,

    success: Palette.deepGreen,
    danger: Palette.alertRedLight,

    divisionOne: Palette.oceanBlue,
    divisionTwo: Palette.royalPurple,
    divisionThree: Palette.deepGreen,

    gold: Palette.championGoldLight,
    silver: Palette.silverLight,
    bronze: Palette.bronzeLight,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// ---------------------------------------------------------------------------
// TYPE SCALE
// ---------------------------------------------------------------------------
export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

type TypographyPreset = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'textTransform'
>;

export const Typography = {
  /** Greeting-style hero text, e.g. "Alex!" */
  display: { fontSize: 32, lineHeight: 38, fontWeight: FontWeight.extrabold },
  /** Screen titles, e.g. "DIVISIONS", "MY RANKING" */
  h1: { fontSize: 24, lineHeight: 30, fontWeight: FontWeight.bold },
  /** Card / section titles, e.g. a division name, an angler name */
  h2: { fontSize: 18, lineHeight: 24, fontWeight: FontWeight.bold },
  /** List item titles, e.g. a catch name */
  h3: { fontSize: 15, lineHeight: 20, fontWeight: FontWeight.bold },
  /** Large centered numbers inside progress rings, e.g. "68%" */
  numericHero: { fontSize: 40, lineHeight: 44, fontWeight: FontWeight.extrabold },
  /** Stat-tile numbers, e.g. "186.7", "14" */
  statValue: { fontSize: 26, lineHeight: 30, fontWeight: FontWeight.extrabold },
  /** Default body copy, captions on posts */
  body: { fontSize: 15, lineHeight: 22, fontWeight: FontWeight.medium },
  /** Secondary/supporting body copy */
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: FontWeight.medium },
  /** Uppercase eyebrow labels, e.g. "YOUR RANK", "CURRENT DIVISION" */
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Timestamps and muted meta text */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: FontWeight.medium },
  /** Bottom tab bar labels. Smaller than `caption` because five tabs plus
   * the raised Catch button leave roughly 47px per tab at phone width —
   * anything larger clips "Divisions". Matches the ~10px platform tab
   * bars use. */
  navLabel: { fontSize: 10, lineHeight: 13, fontWeight: FontWeight.semibold },
  /** Button labels, e.g. "SUBMIT CATCH", "VOTE NOW" */
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypographyPreset>;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

// ---------------------------------------------------------------------------
// SPACING — 4px-rooted scale. Every margin/padding/gap in the app should be
// one of these values.
// ---------------------------------------------------------------------------
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// ---------------------------------------------------------------------------
// RADII
// ---------------------------------------------------------------------------
/**
 * A palette colour at partial opacity, as an rgba string.
 *
 * For tinting a surface with an accent that is defined once as a hex token —
 * washing a division card in its own colour, say. Deliberately not a second
 * set of "…Faded" tokens: the accent and its wash would then be two values
 * that have to be kept in agreement, and they would eventually disagree.
 *
 * Returns the input untouched if it is not a 6-digit hex, so a caller that
 * passes an already-rgba value degrades to no tint rather than to a broken
 * colour string.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** How a division card is washed in its own colour. Strongest at the top
 * left, gone by the bottom, so the artwork-free card still has somewhere for
 * the eye to enter — and so the stats along the bottom sit on plain dark
 * surface rather than on colour, which is what keeps them readable. */
export const DivisionWash = {
  from: 0.5,
  mid: 0.16,
} as const;

export const Radii = {
  /** Small chips, rank badges */
  xs: 6,
  /** Inputs, small buttons, list thumbnails */
  sm: 10,
  /** Standard cards */
  md: 14,
  /** Hero cards / banners, division cards */
  lg: 20,
  /** Bottom sheets, large modals */
  xl: 28,
  /** Segmented tabs, pill badges, pill buttons */
  pill: 999,
  /** Avatars, icon circles, progress rings — pair with equal width/height */
  circle: 9999,
} as const;

// ---------------------------------------------------------------------------
// SHADOWS / ELEVATION
// Dark-mode cards read as "raised" mainly through a lighter surface color and
// hairline border, not heavy shadow — keep these subtle. `glowPrimary` /
// `glowSecondary` are for the rare accent moments (primary CTA, progress
// rings), not general card elevation.
// ---------------------------------------------------------------------------
export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  glowPrimary: {
    shadowColor: Palette.anglerCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  glowSecondary: {
    shadowColor: Palette.royalPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// COMPONENT PRESETS — button and input tokens. Build the actual
// StyleSheet in the component, but every value in it should trace back here.
// ---------------------------------------------------------------------------
export const ButtonVariants = {
  primary: {
    backgroundColor: Palette.anglerCyan,
    pressedBackgroundColor: Palette.deepCyan,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    textColor: Palette.pureWhite,
    shadow: Shadows.glowPrimary,
  },
  secondary: {
    backgroundColor: Palette.royalPurple,
    pressedBackgroundColor: Palette.deepViolet,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    textColor: Palette.pureWhite,
    shadow: Shadows.glowSecondary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Palette.anglerCyan,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    textColor: Palette.anglerCyan,
  },
  tabActive: {
    backgroundColor: Palette.anglerCyan,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    textColor: Palette.midnight,
  },
  tabInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Palette.borderDark,
    borderRadius: Radii.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    textColor: Palette.mist,
  },
} as const;

export const InputStyle = {
  backgroundColor: Palette.surfaceDark,
  borderWidth: 1,
  borderColor: Palette.borderDark,
  borderRadius: Radii.md,
  paddingVertical: Spacing.two,
  paddingHorizontal: Spacing.three,
  labelColor: Palette.cyanMist,
  valueColor: Palette.pureWhite,
  iconColor: Palette.anglerCyan,
} as const;

// ---------------------------------------------------------------------------
// LAYOUT
// ---------------------------------------------------------------------------
export const MaxContentWidth = 800;
/** Suggested-follows rail on the feed. Sized to fit a circular avatar plus
 * the name and division lines and the follow button beneath it.
 *
 * The card's height is `avatar + 64`, and the avatar is as wide as the
 * column (capped at MAX_CARD_WIDTH), so the tallest case is the 76px avatar
 * on a wide viewport — 140px of content. The few px above that are headroom
 * for larger system font settings, so bumping the text size doesn't clip the
 * follow button. */
export const SuggestedFollowsRailHeight = 146;
/** Join banner in the League Position strip, as a height range rather than
 * a width. Height is the meaningful dimension: the banner is the tallest
 * thing in the row, so it sets the strip's depth and the strip hugs it —
 * which is what makes the artwork read as filling the strip instead of
 * floating in it. Width follows from the artwork's fixed 3.7:1 ratio.
 *
 * A range, not one value, because the banner shares its row with the
 * standings. At 3.7:1 height buys width fast, and every pixel of width the
 * banner takes comes off the text column; once the text no longer fits on
 * one line it wraps, and the wrap deepens the strip by more than the taller
 * banner gained. So the strip gives the text its one-line width first (see
 * LeagueStripTextMinWidth) and sizes the banner from what's left, clamped
 * here — `min` keeps it legible on a 360px phone, `max` stops it dominating
 * the 800px content column on desktop. */
export const LeagueStripBannerHeight = { min: 20, max: 60 } as const;
/** Width the League Position strip reserves for its text column before
 * sizing the join banner. Measured: the "Your Current League Position"
 * label needs 205px on one line at `Typography.label`, and the standings
 * beneath it 194px at `Typography.bodySmall` — so this is the label's
 * width plus a little slack. Below this the label wraps to two lines. */
export const LeagueStripTextMinWidth = 208;
/** Member-search icon on the feed, sitting on the tab pills' row. Matched to
 * the pills' height (bodySmall on ButtonVariants' tab padding) so the row
 * reads as one band rather than the icon setting its own height. */
export const SearchIconSize = 28;
/** Rules icon, on the same row as the search icon but deliberately larger —
 * it opens the one screen explaining how the whole game works, so it earns
 * more weight than a search affordance.
 *
 * Bounded by the gap between the tab pills and the search icon, which is
 * only ~41px on a 360px phone with My League showing. 36 leaves a couple of
 * px either side there and a comfortable margin at 390 and up. */
export const RulesIconSize = 36;
/** The plus on the Catch button, drawn as two bars rather than set from an
 * icon font. Ionicons' plus glyphs — add, add-outline, add-sharp alike — are
 * hairlines: ~115 lit pixels at 28px against ~465 for the camera icon this
 * replaced, so on a bright button it renders but reads as blank. There's no
 * heavier plus in the family, and stroke weight isn't something a font lets
 * you set, so the shape is drawn here where it can be. */
export const CatchPlus = { length: 26, thickness: 4 } as const;
/** Bottom nav bar icons. Bounded by width, not height: the bar splits into
 * two equal halves either side of the Catch button (it has to; see
 * app-tabs.web.tsx), and four tabs divide 2/2, giving ~62px per tab on a
 * 360px phone. These replaced the text labels, so the icon is the whole
 * target — there's no caption beneath it to share the height with, which is
 * why it can run this large.
 *
 * There is headroom here now. The old five-tab bar split 2/3, which left
 * right-hand tabs a third narrower at ~41px and is why this sits at 36; the
 * even split has since bought back ~20px per tab. The bar's depth follows
 * from this value, so raising it deepens the bar by the same amount. */
export const NavIconSize = 42;
/** Box for the activity icon specifically. Its artwork is 1.63:1 where every
 * other nav symbol is near-square, so it gets its own size rather than being
 * squared off — squared, the art fills only ~61% of the box and reads as the
 * small icon in the row.
 *
 * Width matches the others by area (`NavIconSize * sqrt(1.63)`), putting
 * ~54x33 of artwork on screen against their 42x42. Matching by height
 * instead would need a 68px box, wider than a whole tab on a 360px phone.
 *
 * Height is given explicitly, and must stay the artwork's true height at
 * this width. A square box here would be transparent above and below the
 * art — but the bar sizes its row from the tallest icon box, so that
 * invisible padding would deepen the whole bar by 12px. */
export const NavIconWide = { width: 54, height: 33 } as const;
/** The hairlines that separate the bottom nav bar's icons from each other and
 * from the raised Catch button.
 *
 * `height` is deliberately well short of the icon boxes (which stand ~58px
 * with their padding): a rule that ran the bar's full depth would read as a
 * wall chopping the bar into cells, where a short centred one reads as a
 * separator between neighbours. It must not exceed the icon box height either
 * — the bar takes its row height from its tallest child, so a taller divider
 * would silently deepen the whole bar. */
export const NavDividerSize = { width: 1, height: 30 } as const;
/**
 * How much room a tab screen has to leave at the bottom for the nav bar.
 *
 * The bar is `position: absolute; bottom: 0`, so it reserves no space itself.
 * Anything that scrolls has to keep clear of it, or its last item ends up
 * underneath and cannot be reached.
 *
 * Web had no entry here at all, so `Platform.select` fell through to the
 * `?? 0` and every tab screen reserved nothing. The symptom was the bottom
 * post on the feed: visible, but its comments sat under the bar with no way
 * to scroll to them.
 *
 * The web figure is derived rather than measured and frozen, because the
 * bar's depth follows from NavIconSize — as that token's own note says.
 * It is the bar's top padding, plus the icon row's vertical padding, plus
 * each item's vertical padding, plus the icon:
 *
 *   Spacing.three + (Spacing.two * 2) + (Spacing.two * 2) + NavIconSize
 *   16           + 16                + 16                + 42          = 90
 *
 * The Catch button sits inside that and needs no clearance of its own: 64px
 * tall at Spacing.four from the bottom reaches 88, just under the bar's 90.
 *
 * iOS and Android keep their measured constants. The native tab bar's real
 * height isn't something the JS side can read, which is the whole reason
 * this token exists rather than a layout measurement.
 *
 * Declared after NavIconSize because it is computed from it — a `const` used
 * before its initialiser throws at module load, not at build.
 */
export const BottomTabInset =
  Platform.select({
    ios: 50,
    android: 80,
    web: Spacing.three + Spacing.two * 4 + NavIconSize,
  }) ?? 0;
/** Thumbnails of an angler's counting fish in a league table row, and how
 * far each one tucks under the previous.
 *
 * Overlapped rather than spaced, because five of them sit between the
 * avatar and the name on a 375px row and the alternative is measurably
 * worse: laid out end to end at this size the strip is 98px and the
 * "best 45lb 3oz" line beneath the name truncates. Tucked, the same five
 * come to 66px and it fits. It also reads as one stack of photos belonging
 * to the angler rather than five loose squares.
 *
 *  must stay well under  or the fish become unrecognisable
 * slivers — at 18/6 each shows two thirds of itself. */
export const LeagueFishThumb = { size: 18, overlap: 6 } as const;
/**
 * The Carp Leagues mark sitting on each feed photo.
 *
 * Small rather than faint is what makes it discreet. The logo is fine gold
 * detail on a dark shield, and dropping its opacity much below this turns
 * that detail to mud without making it any less noticeable — so the size
 * does the work and the opacity only takes the edge off.
 *
 * 40 against a photo that is the full card width — about 343 on a 375px
 * phone — leaves the mark at roughly a ninth of the frame. Legible as a
 * badge, nowhere near able to compete with the fish.
 *
 * Sits opposite the weight badge, which is bottom-left, so the two never
 * meet whatever the photo is.
 */
export const PostWatermark = {
  size: 84,
  opacity: 0.85,
  inset: Spacing.two,
  /** How far the mark rises above the photo, onto the card's blue header
   * band. Applied as a negative `top` inside the photo wrapper rather than
   * by positioning against the header's height: the header's depth comes
   * from its tallest child at runtime, and onLayout does not fire for these
   * nodes on react-native-web, so anything derived from a measurement would
   * sit at its initial value forever.
   *
   * The card clips to its own rounded corner, so the mark can overflow the
   * photo without escaping the card. */
  riseAbovePhoto: 46,
} as const;

/**
 * The gold ring that marks a paid member, wherever their avatar appears.
 *
 * Drawn as a border on the avatar itself rather than as a wrapper around it.
 * A wrapper would add its own width to every layout that contains an avatar
 * — league table rows and the suggested rail are both tight enough that a
 * few pixels there push text onto a second line — whereas a border insets
 * the picture and leaves the footprint identical. The photo loses a couple
 * of pixels at the edge; nothing moves.
 *
 * Scaled in three steps rather than as a ratio. A ratio gives fractional
 * widths, which render as a blurred half-pixel line and read as a mistake
 * rather than as a ring, and the sizes in this app cluster into these three
 * groups anyway: the 18px league thumbnails and small rows, ordinary 40-60px
 * avatars, and the 104px leader portrait.
 */
export const PaidMemberRing = {
  small: 2,
  medium: 3,
  large: 4,
  /** Below this an avatar gets `small`; below `largeAbove` it gets `medium`. */
  mediumAbove: 32,
  largeAbove: 88,
} as const;

/** Border style marking `size`px avatar as belonging to a paid member.
 * Spread into an existing avatar style — it deliberately sets nothing but
 * the border, so it cannot disturb the layout it lands in. */
export function paidRing(size: number, gold: string) {
  const width =
    size >= PaidMemberRing.largeAbove
      ? PaidMemberRing.large
      : size >= PaidMemberRing.mediumAbove
        ? PaidMemberRing.medium
        : PaidMemberRing.small;
  return { borderWidth: width, borderColor: gold };
}
/** Caps on the welcome screen's artwork, which is otherwise width-driven.
 *
 * Both exist for the same reason: that screen must fit without scrolling,
 * and every one of its elements is art whose height is its width over a
 * fixed ratio — so the only way to buy vertical space is to stop something
 * being as wide as the column.
 *
 * `button` is the tighter constraint of the two. The buttons are 4:1, so a
 * pixel off their width is only a quarter-pixel off their height, and there
 * are two of them. Do not take it below 176: at 4:1 that is a 44px tall
 * target, the minimum a finger can reliably hit. */
export const WelcomeArtMaxWidth = { logo: 214, button: 200 } as const;
/** The division leader's avatar on the Leaders page. Sized to be the thing
 * the eye lands on first in its card — it's the whole point of that screen,
 * where it used to be a 64px thumbnail in a left-aligned row and read as
 * incidental. Big enough to carry the trophy badge on its rim without the
 * two crowding each other. */
export const LeaderAvatarSize = 104;
/** Trophy badge that sits on the leader avatar's rim. */
export const LeaderBadgeSize = 34;
