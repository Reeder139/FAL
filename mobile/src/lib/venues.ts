import { supabase } from '@/lib/supabase';

export interface Venue {
  id: string;
  name: string;
  county: string | null;
}

/** Case-insensitive prefix/substring search — venues have no uniqueness
 * constraint on name by design (CLAUDE.md: "expect duplicates, merge, never
 * delete"), so this is a plain search, not a lookup.
 *
 * Restricted to merged_into is null (hide venues folded into another one by
 * the merge tool) and approved (hide not-yet-reviewed angler submissions) —
 * every venue-picking query needs both filters, or a merged/pending venue
 * can still get picked from search. */
export async function searchVenues(query: string): Promise<Venue[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const { data, error } = await supabase
    .from('venues')
    .select('id, name, county')
    .is('merged_into', null)
    .eq('approved', true)
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(20);

  if (error) throw error;
  return data;
}

const VENUE_SUFFIX_RE = /\s+(fishery|lakes|lake|pool)$/i;

/** Lowercase, trim, strip punctuation, and drop one trailing generic suffix
 * word ("fishery"/"lakes"/"lake"/"pool") so "Linear Fisheries" and "Linear"
 * compare closer together than they would as raw strings. */
function normalizeVenueName(name: string): string {
  const stripped = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.replace(VENUE_SUFFIX_RE, '').trim();
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

/**
 * Fuzzy near-duplicate check run right before an angler creates a new venue
 * — "did you mean one of these?" Deliberately broader than searchVenues:
 * it also matches not-yet-approved venues (other anglers' pending
 * submissions), since the whole point is catching duplicates before they're
 * created, not just against the public picker list.
 */
export async function findSimilarVenues(name: string): Promise<Venue[]> {
  const normalized = normalizeVenueName(name);
  if (normalized.length === 0) return [];

  const firstWord = normalized.split(' ')[0];
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, county')
    .is('merged_into', null)
    .ilike('name', `%${firstWord}%`)
    .limit(50);
  if (error) throw error;

  const maxDistance = Math.min(3, Math.floor(Math.max(normalized.length, 4) * 0.2));

  return (data ?? []).filter((venue) => {
    const candidate = normalizeVenueName(venue.name);
    if (candidate.length === 0) return false;
    if (candidate === normalized) return true;
    if (candidate.length > 3 && (candidate.includes(normalized) || normalized.includes(candidate))) return true;
    return levenshtein(candidate, normalized) <= maxDistance;
  });
}
