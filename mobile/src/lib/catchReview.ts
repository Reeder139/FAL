import { supabase } from '@/lib/supabase';

export interface CatchUnderReview {
  catchId: string;
  postId: string;
  weightOz: number;
  caughtAt: string;
  /** Why it was pulled, taken from the review that set the status. Null only
   * if a reviewer left no reason, which the admin functions do not allow but
   * older rows might. */
  reason: string | null;
  reviewedAt: string | null;
}

/**
 * The signed-in angler's catches currently under review.
 *
 * `catches` is readable but `catch_reviews` is admin-gated, so the reason
 * cannot be read from here by an ordinary member — the reason travels to
 * them through the support thread request_evidence() opens instead. This
 * returns the reason when the caller can see it (an admin looking at their
 * own account) and null otherwise, rather than failing the whole query.
 */
export async function fetchMyCatchesUnderReview(): Promise<CatchUnderReview[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('catches')
    .select('id, post_id, weight_oz, caught_at')
    .eq('angler_id', user.id)
    .eq('status', 'under_review')
    .order('caught_at', { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Best effort: RLS hides catch_reviews from non-admins, which surfaces as
  // an empty result rather than an error, so this degrades to "no reason
  // shown" instead of breaking the banner.
  const { data: reviews } = await supabase
    .from('catch_reviews')
    .select('catch_id, reason, created_at, to_status')
    .in(
      'catch_id',
      data.map((c) => c.id)
    )
    .eq('to_status', 'under_review')
    .order('created_at', { ascending: false });

  const latestByCatch = new Map<string, { reason: string | null; created_at: string }>();
  for (const r of reviews ?? []) {
    if (!latestByCatch.has(r.catch_id)) latestByCatch.set(r.catch_id, r);
  }

  return data.map((c) => ({
    catchId: c.id,
    postId: c.post_id,
    weightOz: c.weight_oz,
    caughtAt: c.caught_at,
    reason: latestByCatch.get(c.id)?.reason ?? null,
    reviewedAt: latestByCatch.get(c.id)?.created_at ?? null,
  }));
}
