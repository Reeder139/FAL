import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { extractExif } from '@/lib/exif';
import { computePerceptualHash } from '@/lib/perceptualHash';
import { supabase } from '@/lib/supabase';

/**
 * NOTE ON IMPORT ORDER: this module imports supabase.ts, which creates the
 * auth client — and touches window/AsyncStorage — as a side effect of
 * merely being imported. That already broke this app's static web SSR pass
 * once (see storage.ts's comment) when pulled into a route's module graph.
 * Only import catchPhoto.ts from inside an event handler or a client-only
 * screen, never at module scope from something Expo Router pre-renders.
 */

const POST_MEDIA_BUCKET = 'post-media';
/** Fixed grid for hashing — deliberately distorts aspect ratio so every
 * photo hashes against the same shape. See perceptualHash.ts. */
const HASH_RESIZE = { width: 9, height: 8 };
const UPLOAD_MAX_DIMENSION = 1600;
const UPLOAD_COMPRESSION = 0.8;

export interface PickedCatchPhoto {
  uri: string;
  width: number;
  height: number;
}

export interface PreparedCatchPhoto {
  /** Resized/compressed bytes ready to upload — EXIF is already gone from
   * these by design; exifTakenAt/cameraMake/cameraModel below were pulled
   * from the original before this copy was made. */
  uploadBytes: ArrayBuffer;
  exifTakenAt: string | null;
  exifCameraMake: string | null;
  exifCameraModel: string | null;
  perceptualHash: string;
}

async function readUriAsBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

/**
 * Opens the camera roll picker — this app has no mandatory in-app capture
 * requirement. No crop/edit step: letting anglers crop evidence photos
 * would undermine the point of them being evidence.
 */
export async function pickCatchPhoto(): Promise<PickedCatchPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Extracts EXIF and computes a perceptual hash from the *original* picked
 * photo, then produces the resized/compressed copy that actually gets
 * uploaded — strictly in that order. Doing the resize first would silently
 * lose the EXIF data, since resizing strips it.
 */
export async function prepareCatchPhoto(photo: PickedCatchPhoto): Promise<PreparedCatchPhoto> {
  const originalBytes = await readUriAsBytes(photo.uri);
  const exif = extractExif(originalBytes);

  const hashSource = await manipulateAsync(photo.uri, [{ resize: HASH_RESIZE }], {
    format: SaveFormat.JPEG,
    compress: 1,
  });
  const perceptualHash = computePerceptualHash(await readUriAsBytes(hashSource.uri));

  const uploadWidth = photo.width > 0 ? Math.min(photo.width, UPLOAD_MAX_DIMENSION) : UPLOAD_MAX_DIMENSION;
  const uploadCopy = await manipulateAsync(photo.uri, [{ resize: { width: uploadWidth } }], {
    format: SaveFormat.JPEG,
    compress: UPLOAD_COMPRESSION,
  });
  const uploadBytes = await readUriAsBytes(uploadCopy.uri);

  return {
    uploadBytes,
    exifTakenAt: exif.takenAt,
    exifCameraMake: exif.cameraMake,
    exifCameraModel: exif.cameraModel,
    perceptualHash,
  };
}

/**
 * Uploads the prepared photo into the current user's folder in the
 * post-media bucket (required by its insert policy) and returns the
 * storage path. Doesn't insert the post_media row itself — the caller does
 * that once it has a post_id, passing along exifTakenAt/cameraMake/
 * cameraModel/perceptualHash from `prepareCatchPhoto`.
 */
export async function uploadCatchPhoto(prepared: PreparedCatchPhoto): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to upload a catch photo.');

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const path = `${user.id}/${filename}`;

  const { error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, prepared.uploadBytes, { contentType: 'image/jpeg' });

  if (error) throw error;
  return path;
}
