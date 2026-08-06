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
