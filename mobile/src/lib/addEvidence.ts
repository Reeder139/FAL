import { captureCatchPhoto, prepareCatchPhoto, uploadCatchPhoto } from '@/lib/catchPhoto';
import { supabase } from '@/lib/supabase';

/**
 * Attach further photos to a catch that has already been submitted.
 *
 * This is the only way a catch can be touched after submission, and it adds
 * media — it never edits the weight. That is not a rule this file has to
 * remember: `catches` has no update policy for anglers at all, so the weight
 * is unreachable from here whatever this code tries. Adding media works
 * because post_media's insert policy is scoped to the post's author.
 *
 * In-app capture only, no library picker. Evidence exists to answer a
 * reviewer's doubt, and a photo chosen from the camera roll cannot do that —
 * `captured_in_app` is the field the whole trust model turns on, so an
 * upload that could not set it truthfully would be worse than nothing.
 */
export async function addEvidencePhoto(catchId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to add evidence.');

  const { data: row, error: catchError } = await supabase
    .from('catches')
    .select('post_id, angler_id')
    .eq('id', catchId)
    .single();
  if (catchError) throw catchError;
  if (row.angler_id !== user.id) throw new Error('That catch is not yours.');

  const picked = await captureCatchPhoto();
  if (!picked) return false; // cancelled, or camera permission refused

  const prepared = await prepareCatchPhoto(picked);

  // Index the upload past whatever is already on the post so a second piece
  // of evidence cannot overwrite the first at the same storage path.
  const { count } = await supabase
    .from('post_media')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', row.post_id);

  const uploaded = await uploadCatchPhoto(prepared, user.id, row.post_id, count ?? 0);

  const { error: insertError } = await supabase.from('post_media').insert({
    post_id: row.post_id,
    storage_path: uploaded.storagePath,
    media_kind: 'other',
    // evidence, not gallery: this is for the reviewer, and dropping a
    // late close-up of a set of scales into the feed is not what the
    // angler is trying to do.
    media_role: 'evidence',
    captured_in_app: true,
    exif_taken_at: prepared.exifTakenAt,
    exif_camera_make: prepared.exifCameraMake,
    exif_camera_model: prepared.exifCameraModel,
    exif_raw: prepared.exifRaw,
    perceptual_hash: prepared.perceptualHash,
    width: prepared.width,
    height: prepared.height,
  });
  if (insertError) throw insertError;

  return true;
}
