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
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
/** Suggested-follows rail on the feed — roughly 3x the League Position
 * strip's own height (~52px: two text lines + vertical padding). */
export const SuggestedFollowsRailHeight = 156;
