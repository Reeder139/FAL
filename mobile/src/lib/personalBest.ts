import { supabase } from '@/lib/supabase';

/**
 * An angler's personal best, and where the number came from.
 *
 * There are two PBs in this system and conflating them is the bug this
 * module exists to stop:
 *
 * - `profiles.declared_pb_oz` is a *declaration*, made once at onboarding
 *   and never rewritten. It seeds division placement, and `pb_verified`
 *   gates whether that placement is trusted — an unverified declaration
 *   seeds into Division 1, so proving a low PB is what buys an easier
 *   division. Bumping it whenever someone lands a bigger fish would quietly
 *   re-seed anglers mid-season and break that whole mechanism.
 *
 * - The *current* PB is the heavier of that declaration and the angler's
 *   best verified catch. This is what a person means by "my PB", and it is
 *   what every screen should show.
 *
 * So: never write declared_pb_oz from a catch. Derive on read instead.
 */
export type PersonalBest = {
  /** The heavier of the two, or null when there is neither. */
  oz: number | null;
  /** True when a verified catch — not the declaration — is what set it.
   * Callers use this to decide whether to nudge for evidence. */
  fromVerifiedCatch: boolean;
};

export function personalBest(declaredOz: number | null, bestVerifiedOz: number | null): PersonalBest {
  if (declaredOz === null && bestVerifiedOz === null) return { oz: null, fromVerifiedCatch: false };
  const declared = declaredOz ?? 0;
  const caught = bestVerifiedOz ?? 0;
  return { oz: Math.max(declared, caught), fromVerifiedCatch: caught > declared };
}

/**
 * The heaviest catch this angler has had verified, or null.
 *
 * Verified only, deliberately: a pending or under-review weight is a claim,
 * not evidence, and showing it as someone's PB would let an unchecked
 * number onto their profile.
 */
export async function fetchBestVerifiedCatchOz(anglerId: string): Promise<number | null> {
  const { data } = await supabase
    .from('catches')
    .select('weight_oz')
    .eq('angler_id', anglerId)
    .eq('status', 'verified')
    .order('weight_oz', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.weight_oz ?? null;
}
