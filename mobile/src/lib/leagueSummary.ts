import { supabase } from '@/lib/supabase';

export type LeagueSummary =
  | { kind: 'no_catches' }
  | { kind: 'member'; divisionName: string; position: number | null; divisionMemberCount: number; points: number }
  | { kind: 'free'; points: number; position: number | null; divisionMemberCount: number; divisionName: string | null };

/**
 * Drives the league summary strip. Three states, checked in this order:
 * 1. No catches at all yet (regardless of membership) -> neutral prompt.
 * 2. Has a season_entries row for the current season -> read straight from
 *    league_table (position/points come from real standings).
 * 3. No season_entries row -> hypothetical_league_position, the same
 *    "mirror the real scoring without requiring a row" approach the catch
 *    result card uses for hypothetical_catch_preview.
 *
 * If there's no active season right now at all, this also falls back to
 * the "no_catches" message — there's nothing seasonal to summarize either
 * way, and inventing a fourth UI state for that wasn't asked for.
 */
export async function fetchLeagueSummary(): Promise<LeagueSummary | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { count: catchCount } = await supabase
    .from('catches')
    .select('id', { count: 'exact', head: true })
    .eq('angler_id', user.id);
  if (!catchCount) return { kind: 'no_catches' };

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
  if (!season) return { kind: 'no_catches' };

  const { data: entry } = await supabase
    .from('season_entries')
    .select('division_id')
    .eq('season_id', season.id)
    .eq('angler_id', user.id)
    .is('left_at', null)
    .maybeSingle();

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
  if (!hyp) return { kind: 'no_catches' };

  return {
    kind: 'free',
    points: hyp.hypothetical_season_total,
    position: hyp.division_member_count >= 20 ? hyp.hypothetical_position : null,
    divisionMemberCount: hyp.division_member_count,
    divisionName: hyp.division_name,
  };
}
