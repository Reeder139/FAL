import { searchAnglers, type AnglerSearchResult } from '@/lib/anglerSearch';
import { fetchPaidMemberIds } from '@/lib/paidMembers';
import { supabase } from '@/lib/supabase';

export type WitnessStatus = 'pending' | 'confirmed' | 'declined';

export interface WitnessStatement {
  catchId: string;
  witnessId: string;
  witnessUsername: string;
  status: WitnessStatus;
  weightOz: number;
  respondedAt: string | null;
}

/**
 * Paid members matching a search, for the witness picker.
 *
 * Reuses the member search the feed already has and filters it, rather than
 * adding a paid-only search to the database. The filter has to happen
 * somewhere, and doing it here keeps one definition of how a member is found
 * and one of what "paid" means — fetchPaidMemberIds, the same lookup the gold
 * ring uses.
 *
 * The trade is that a search returning twenty free members shows none of
 * them. That reads as "no paid members by that name", which is true, and the
 * picker says so.
 */
export async function searchWitnessCandidates(
  query: string,
  excludeId: string | null
): Promise<AnglerSearchResult[]> {
  const results = await searchAnglers(query, 20);
  const candidates = results.filter((r) => r.id !== excludeId);
  if (candidates.length === 0) return [];

  const paid = await fetchPaidMemberIds(candidates.map((c) => c.id));
  return candidates.filter((c) => paid.has(c.id));
}

/** Ask a member to vouch for a catch. One per catch — the database refuses a
 * second, so a decline cannot be followed by shopping for a friendlier
 * answer. */
export async function nominateWitness(catchId: string, witnessId: string): Promise<void> {
  const { error } = await supabase.rpc('nominate_witness', {
    p_catch_id: catchId,
    p_witness_id: witnessId,
  });
  if (error) throw error;
}

/** Answer a request. Only the nominated witness can, and only once. */
export async function respondToWitnessRequest(catchId: string, confirmed: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_witness_request', {
    p_catch_id: catchId,
    p_confirmed: confirmed,
  });
  if (error) throw error;
}

/** Witness statements for a set of catches, for the pages that display them. */
export async function fetchWitnessStatements(
  catchIds: string[]
): Promise<Map<string, WitnessStatement>> {
  if (catchIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('catch_witnesses')
    .select('catch_id, witness_id, status, weight_oz, responded_at, profiles!catch_witnesses_witness_id_fkey(username)')
    .in('catch_id', catchIds);
  if (error) return new Map();

  return new Map(
    (data ?? []).map((row) => {
      const witness = row as unknown as {
        catch_id: string;
        witness_id: string;
        status: WitnessStatus;
        weight_oz: number;
        responded_at: string | null;
        profiles: { username: string } | null;
      };
      return [
        witness.catch_id,
        {
          catchId: witness.catch_id,
          witnessId: witness.witness_id,
          witnessUsername: witness.profiles?.username ?? 'a member',
          status: witness.status,
          weightOz: witness.weight_oz,
          respondedAt: witness.responded_at,
        },
      ];
    })
  );
}
