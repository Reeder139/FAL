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
 * Uploads every photo, then calls submit_catch in a single RPC so the
 * write (post + optional catch + all post_media rows) can't half-succeed.
 * The post_id is generated here, before any upload, since the storage path
 * itself — {user_id}/{post_id}/{filename} — depends on it.
 */
export async function submitCatch(input: SubmitCatchInput): Promise<SubmitCatchResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to submit a catch.');

  const postId = generateUuidV4();

  const uploaded = await Promise.all(
    input.photos.map((photo, index) => uploadCatchPhoto(photo.prepared, user.id, postId, index))
  );

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
