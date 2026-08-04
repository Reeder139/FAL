import { Colors } from '@/constants/theme';

/**
 * The app's palette. Always dark, deliberately — it does not follow the
 * device's colour scheme.
 *
 * FAL is a dark-first product (DESIGN.md: 14 of the 16 reference screens are
 * dark) and much of it can't be anything else. The welcome screen, the upsell
 * and rules cards and the division cards are all pinned to the dark palette
 * because they sit on fixed artwork. Following the system into light mode
 * therefore didn't produce a light theme — it left those dark surfaces
 * stranded on a near-white background.
 *
 * Colors.light is kept rather than deleted: it's a complete, documented
 * palette, and this function is the single place that has to change to bring
 * a light theme back once the artwork can support one.
 */
export function useTheme() {
  return Colors.dark;
}
