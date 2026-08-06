import { getPublicStorageUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export interface MiniLeagueSummary {
  id: string;
  name: string;
  joinCode: string;
  ownerId: string;
  ownerUsername: string;
  memberCount: number;
  seasonName: string;
  isOwner: boolean;
}

export interface MiniLeagueRow {
  anglerId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  countingFish: number;
  bestFishOz: number | null;
  position: number;
  isYou: boolean;
}

/** Thrown when a free member tries to create one. Its own type so the screen
 * can offer the upgrade rather than showing a raw error. */
export class PaidMembersOnlyError extends Error {}

export async function fetchMyMiniLeagues(): Promise<MiniLeagueSummary[]> {
  const { data, error } = await supabase.rpc('my_mini_leagues');
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    joinCode: row.join_code as string,
    ownerId: row.owner_id as string,
    ownerUsername: row.owner_username as string,
    memberCount: row.member_count as number,
    seasonName: row.season_name as string,
    isOwner: row.is_owner as boolean,
  }));
}

export async function fetchMiniLeagueTable(miniLeagueId: string): Promise<MiniLeagueRow[]> {
  const { data, error } = await supabase.rpc('mini_league_table', { p_mini_league_id: miniLeagueId });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    anglerId: row.angler_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: row.avatar_path ? getPublicStorageUrl('post-media', row.avatar_path as string) : null,
    points: Number(row.total_points ?? 0),
    countingFish: (row.counting_fish as number) ?? 0,
    bestFishOz: (row.best_fish_oz as number | null) ?? null,
    position: (row.position_in_table as number) ?? 0,
    isYou: (row.is_you as boolean) ?? false,
  }));
}

/** Creates the league and puts the invited anglers in it. The owner is added
 * by the function, so they don't need to be in `memberIds`. */
export async function createMiniLeague(name: string, memberIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_mini_league', {
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error) {
    if (error.message.includes('PAID_ONLY')) {
      throw new PaidMembersOnlyError('Only paid members can create a mini league.');
    }
    throw error;
  }
  return data as string;
}

/** Owner-only. Returns how many were actually added — anyone already in is
 * skipped rather than being an error. */
export async function addMiniLeagueMembers(miniLeagueId: string, memberIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('add_mini_league_members', {
    p_mini_league_id: miniLeagueId,
    p_member_ids: memberIds,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** The owner may remove anyone; anyone may remove themselves. The owner
 * cannot remove themselves — they delete the league instead, which is what
 * the error says. */
export async function removeMiniLeagueMember(miniLeagueId: string, anglerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_mini_league_member', {
    p_mini_league_id: miniLeagueId,
    p_angler_id: anglerId,
  });
  if (error) {
    throw new Error(
      error.message.includes('OWNER_CANNOT_LEAVE')
        ? 'You own this league — delete it instead of leaving.'
        : error.message
    );
  }
}

export async function renameMiniLeague(miniLeagueId: string, name: string): Promise<void> {
  const { error } = await supabase.from('mini_leagues').update({ name: name.trim() }).eq('id', miniLeagueId);
  if (error) throw error;
}

/** Owner-only, enforced by RLS rather than by a function — there is nothing
 * to do beyond the delete, and the membership cascades. */
export async function deleteMiniLeague(miniLeagueId: string): Promise<void> {
  const { error } = await supabase.from('mini_leagues').delete().eq('id', miniLeagueId);
  if (error) throw error;
}

export async function joinMiniLeagueByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_mini_league', { p_code: code });
  if (error) {
    throw new Error(
      error.message.includes('NO_SUCH_LEAGUE') ? "No mini league has that code." : error.message
    );
  }
  return data as string;
}
