import { supabase } from '@/lib/supabase';

/**
 * Which anglers are paid members right now.
 *
 * Read from season_entries, not from subscriptions. `subscriptions` is RLS'd
 * to its owner — deliberately, since one angler has no business reading
 * another's billing state — so it can only ever answer for the signed-in
 * user. season_entries is broadly readable and already carries the same fact
 * in league terms: an open `competitor` stint in the running season is
 * exactly what "paid up" means to the competition.
 *
 * That also makes the ring agree with the league table by construction. The
 * two can't drift, because they are reading the same row: if a lapse closed
 * the stint, the fish stop counting and the ring goes at the same moment.
 */

/** Cached per set of ids for the life of a screen. Feed pages and league
 * tables ask about the same anglers repeatedly as they scroll. */
const cache = new Map<string, boolean>();

export async function fetchPaidMemberIds(anglerIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(anglerIds)].filter(Boolean);
  const known = new Set<string>();
  const unknown: string[] = [];
  for (const id of unique) {
    const hit = cache.get(id);
    if (hit === undefined) unknown.push(id);
    else if (hit) known.add(id);
  }
  if (unknown.length === 0) return known;

  const today = new Date().toISOString().slice(0, 10);
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .in('status', ['open', 'running'])
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Between seasons nobody is a competitor in one, so nobody gets a ring.
  if (!season) {
    for (const id of unknown) cache.set(id, false);
    return known;
  }

  const { data, error } = await supabase
    .from('season_entries')
    .select('angler_id')
    .eq('season_id', season.id)
    .eq('tier', 'competitor')
    .is('left_at', null)
    .in('angler_id', unknown);

  // On failure, cache nothing and return what is known. A wrong `false` would
  // stick for the session and quietly un-badge a paying member.
  if (error) return known;

  const paid = new Set((data ?? []).map((r) => r.angler_id as string));
  for (const id of unknown) cache.set(id, paid.has(id));
  for (const id of paid) known.add(id);
  return known;
}

/** Drop the cache — after the signed-in angler's own membership changes, so
 * their ring appears without a reload. */
export function clearPaidMemberCache(): void {
  cache.clear();
}
