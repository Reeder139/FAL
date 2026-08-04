import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** True only for a `competitor`-tier entry in the running season. Everyone
 * else — `open` tier, or no season_entries row at all — is a non-paid
 * member and gets the "Join the League" prompt on the summary strip. */
type PaidFlag = { isPaidMember: boolean };

export type LeagueSummary = PaidFlag &
  (
    | { kind: 'no_catches' }
    | { kind: 'no_active_season' }
    | { kind: 'member'; divisionName: string; position: number | null; divisionMemberCount: number; points: number }
    | { kind: 'free'; points: number; position: number | null; divisionMemberCount: number; divisionName: string | null }
  );

/**
 * Drives the league summary strip. Checked in this order:
 * 1. No catches at all yet (regardless of membership) -> neutral prompt.
 * 2. Has catches, but no season is currently open/running -> its own
 *    message. This must NOT fall back to "no_catches" — that's actively
 *    wrong when the angler has genuinely logged something; it just isn't
 *    scoreable against anything right now.
 * 3. Has a season_entries row for the current season -> read straight from
 *    league_table (position/points come from real standings).
 * 4. No season_entries row -> hypothetical_league_position, the same
 *    "mirror the real scoring without requiring a row" approach the catch
 *    result card uses for hypothetical_catch_preview.
 *
 * The season and entry lookups now happen before the no_catches check
 * rather than after, because paid status has to be known for every branch
 * — a paid member with no catches yet shouldn't be told to go and join.
 * The ordering of the branches themselves is unchanged.
 */
export async function fetchLeagueSummary(): Promise<LeagueSummary | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [{ count: catchCount }, { data: season }] = await Promise.all([
    supabase.from('catches').select('id', { count: 'exact', head: true }).eq('angler_id', user.id),
    supabase
      .from('seasons')
      .select('id')
      .in('status', ['open', 'running'])
      .lte('starts_on', today)
      .gte('ends_on', today)
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: entry } = season
    ? await supabase
        .from('season_entries')
        .select('division_id, tier')
        .eq('season_id', season.id)
        .eq('angler_id', user.id)
        .is('left_at', null)
        .maybeSingle()
    : { data: null };

  const isPaidMember = entry?.tier === 'competitor';

  if (!catchCount) return { kind: 'no_catches', isPaidMember };
  if (!season) return { kind: 'no_active_season', isPaidMember };

  if (entry) {
    const [{ data: table }, { data: division }, { count: memberCount }] = await Promise.all([
      supabase
        .from('league_table')
        .select('total_points, position')
        .eq('season_id', season.id)
        .eq('division_id', entry.division_id)
        .eq('angler_id', user.id)
        .maybeSingle(),
      supabase.from('divisions').select('name').eq('id', entry.division_id).maybeSingle(),
      supabase
        .from('season_entries')
        .select('id', { count: 'exact', head: true })
        .eq('season_id', season.id)
        .eq('division_id', entry.division_id),
    ]);

    return {
      kind: 'member',
      isPaidMember,
      divisionName: division?.name ?? '—',
      // No league_table row means nothing verified in-period yet — points-
      // only, same "don't show a fabricated rank" principle as the <20
      // members case below.
      position: table?.position ?? null,
      divisionMemberCount: memberCount ?? 0,
      points: table?.total_points ?? 0,
    };
  }

  const { data: hypRows } = await supabase.rpc('hypothetical_league_position', { p_angler_id: user.id });
  const hyp = hypRows?.[0];
  // A season exists, but no division matches this angler's declared PB —
  // a data-configuration gap (divisions should cover the full range), not
  // "no catches". Closest existing state: nothing seasonal to show.
  if (!hyp) return { kind: 'no_active_season', isPaidMember };

  return {
    kind: 'free',
    isPaidMember,
    points: hyp.hypothetical_season_total,
    position: hyp.division_member_count >= 20 ? hyp.hypothetical_position : null,
    divisionMemberCount: hyp.division_member_count,
    divisionName: hyp.division_name,
  };
}

/** Shared by every tab screen that renders the League strip in its header,
 * so the fetch-on-mount boilerplate lives in one place. */
export function useLeagueSummary(): LeagueSummary | null {
  const [summary, setSummary] = useState<LeagueSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeagueSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return summary;
}
