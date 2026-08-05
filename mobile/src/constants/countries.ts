/**
 * Countries offered at sign-up.
 *
 * Stored as ISO 3166-1 alpha-2 on `profiles.country`, because leagues by
 * country means grouping by that column and "UK" / "United Kingdom" /
 * "Great Britain" / "england" do not group.
 *
 * A curated list, not all 249 codes: this is a scroll list in a sign-up form,
 * and every entry a member scrolls past is friction on the one screen where
 * friction costs most. These are the countries with an established carp
 * scene — which is who the app is for — ordered with the UK first because
 * that is where the league actually runs today.
 *
 * Extending it is adding a line. Do that rather than reaching for a free-text
 * field the moment someone from elsewhere signs up: the whole point of the
 * code is that it can be grouped on.
 */
export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IT', name: 'Italy' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'DK', name: 'Denmark' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'FI', name: 'Finland' },
  { code: 'HR', name: 'Croatia' },
  { code: 'RS', name: 'Serbia' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'ZA', name: 'South Africa' },
];

/** Where the league runs today, so it is the sensible default. */
export const DEFAULT_COUNTRY = 'GB';

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}
