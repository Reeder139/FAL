import { supabase } from '@/lib/supabase';

/**
 * The reasons offered in the report sheet.
 *
 * A fixed list rather than a free-text box alone. A reviewer opening the
 * queue needs to know what kind of doubt this is before they open the photo,
 * and "looks wrong" from fifty people sorts into nothing. The note is where
 * the detail goes.
 */
export const REPORT_REASONS = [
  { id: 'not_their_fish', label: "This isn't their fish" },
  { id: 'photo_reused', label: 'This photo has been used before' },
  { id: 'weight_wrong', label: 'The weight looks wrong' },
  { id: 'wrong_venue', label: 'Wrong venue' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]['id'];

/**
 * Report a catch.
 *
 * Goes through an RPC rather than inserting into `flags` directly. The
 * policy on that table only checks you are writing your own reporter_id — it
 * does not stop you reporting your own fish, or filing the same complaint
 * over and over. Those guards live in the function.
 *
 * Reporting the same catch twice is not an error. Flags are readable by
 * admins only, so nothing here could tell you a report already existed
 * without leaking that it landed.
 */
export async function reportCatch(
  catchId: string,
  reasonId: ReportReasonId,
  note: string
): Promise<void> {
  const label = REPORT_REASONS.find((r) => r.id === reasonId)?.label ?? reasonId;
  const trimmed = note.trim();
  // The label leads so the queue is scannable; the note follows for the
  // reviewer who opens it.
  const reason = trimmed ? `${label} — ${trimmed}` : label;

  const { error } = await supabase.rpc('report_catch', {
    p_catch_id: catchId,
    p_reason: reason,
  });
  if (error) throw error;
}
