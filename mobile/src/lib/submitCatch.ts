import { uploadCatchPhoto, type MediaRole, type PreparedCatchPhoto } from '@/lib/catchPhoto';
import { supabase } from '@/lib/supabase';
import { generateUuidV4 } from '@/lib/uuid';

/** Maps directly to posts.visibility — see VisibilityPicker for the
 * plain-English labels shown for each. */
export type PostVisibility = 'public' | 'followers' | 'league_only' | 'hidden';

export interface CatchPhotoInput {
  prepared: PreparedCatchPhoto;
  role: MediaRole;
}

export interface SubmitCatchInput {
  caption: string | null;
  weightOz: number | null;
  caughtAt: Date;
  venueId: string | null;
  newVenueName: string | null;
  venueHidden: boolean;
  visibility: PostVisibility;
  photos: CatchPhotoInput[];
}

export interface SubmitCatchResult {
  postId: string;
  catchId: string | null;
  status: 'verified' | 'under_review' | null;
}

/** Thrown specifically for a perceptual-hash collision, so the UI can show
 * a clear, distinct message rather than a generic error. */
export class DuplicateImageError extends Error {}

/**
 * Removes photos that were uploaded for a submission that then failed.
 *
 * Best effort by design: the caller is already reporting a failure, and a
 * cleanup that threw would replace a useful message ("this photo has already
 * been submitted") with a confusing one about storage. Anything that slips
 * through shows up in private.orphaned_upload_objects for an admin to sweep.
 *
 * The delete is allowed by the "users clear own abandoned uploads" policy,
 * which only permits objects no post_media row references — so this can
 * never reach a photo that belongs to a committed catch.
 */
async function discardUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('post-media').remove(paths);
  if (error) {
    console.warn('[submitCatch] could not remove abandoned uploads:', error.message);
  }
}

/**
 * Uploads every photo, then calls submit_catch in a single RPC so the
 * write (post + optional catch + all post_media rows) can't half-succeed.
 * The post_id is generated here, before any upload, since the storage path
 * itself — {user_id}/{post_id}/{filename} — depends on it.
 *
 * Because the uploads land before the RPC, every failure after that point
 * has to put them back. Without this the bucket accumulated a folder of
 * photos per rejected submission, referenced by nothing and visible to
 * nobody.
 */
export async function submitCatch(input: SubmitCatchInput): Promise<SubmitCatchResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to submit a catch.');

  const postId = generateUuidV4();

  // allSettled, not all: when one upload fails the others may already have
  // succeeded, and Promise.all would abandon them without a reference.
  const results = await Promise.allSettled(
    input.photos.map((photo, index) => uploadCatchPhoto(photo.prepared, user.id, postId, index))
  );
  const uploaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));

  if (uploaded.length !== results.length) {
    await discardUploads(uploaded.map((photo) => photo.storagePath));
    const firstFailure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    throw firstFailure.reason instanceof Error
      ? firstFailure.reason
      : new Error('Could not upload your photos.');
  }

  const photosPayload = uploaded.map((photo, index) => ({
    storage_path: photo.storagePath,
    media_role: input.photos[index].role,
    captured_in_app: photo.capturedInApp,
    exif_taken_at: photo.exifTakenAt,
    exif_camera_make: photo.exifCameraMake,
    exif_camera_model: photo.exifCameraModel,
    perceptual_hash: photo.perceptualHash,
    width: photo.width,
    height: photo.height,
  }));

  const { data, error } = await supabase.rpc('submit_catch', {
    p_caption: input.caption,
    p_weight_oz: input.weightOz,
    p_caught_at: input.caughtAt.toISOString(),
    p_venue_id: input.venueId,
    p_new_venue_name: input.newVenueName,
    p_venue_hidden: input.venueHidden,
    p_photos: photosPayload,
    p_post_id: postId,
    p_visibility: input.visibility,
  });

  if (error) {
    // submit_catch is one transaction, so nothing it would have written
    // survives — but the photos above are already in the bucket, and only
    // this line knows where they are.
    await discardUploads(uploaded.map((photo) => photo.storagePath));

    if (error.message.includes('DUPLICATE_IMAGE')) {
      throw new DuplicateImageError('This photo has already been submitted.');
    }
    throw error;
  }

  const row = data?.[0];
  return {
    postId: row?.post_id ?? postId,
    catchId: row?.catch_id ?? null,
    status: row?.status ?? null,
  };
}
