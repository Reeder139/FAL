import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { extractExifFromBytes, extractExifFromNativeDict } from '@/lib/exif';
import { computePerceptualHash } from '@/lib/perceptualHash';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

/**
 * NOTE ON IMPORT ORDER: this module imports supabase.ts, which creates the
 * auth client at module scope. Only import catchPhoto.ts from inside an
 * event handler or a screen that isn't part of the SSR-rendered tree — see
 * sessionStorage.ts / storage.ts for the crash this caused before.
 */

export const MAX_CATCH_PHOTOS = 5;
export type MediaRole = 'hero' | 'gallery' | 'evidence';

const POST_MEDIA_BUCKET = 'post-media';
/** Fixed grid for hashing — deliberately distorts aspect ratio so every
 * photo hashes against the same shape. See perceptualHash.ts. */
const HASH_RESIZE = { width: 9, height: 8 };
const UPLOAD_MAX_DIMENSION = 1600;
const UPLOAD_TARGET_BYTES = 500 * 1024;
/** Tried in order until under UPLOAD_TARGET_BYTES, or we run out — a fixed
 * quality can't hit a byte target directly, so step down a few times. */
const UPLOAD_QUALITY_STEPS = [0.8, 0.6, 0.4, 0.3];

const HEIC_EXTENSIONS = ['.heic', '.heif'];
const HEIC_MIME_TYPES = ['image/heic', 'image/heif'];

export interface PickedCatchPhoto {
  uri: string;
  width: number;
  height: number;
  /** True only for a photo taken via the in-app camera option — camera
   * roll picks (the default path) are never captured_in_app. */
  capturedInApp: boolean;
  /** Native exif dict from the picker (iOS/Android only — web never
   * populates this, see exif.ts). */
  nativeExif: Record<string, unknown> | null;
  isHeic: boolean;
}

export interface PreparedCatchPhoto {
  uploadBytes: ArrayBuffer;
  exifTakenAt: string | null;
  exifCameraMake: string | null;
  exifCameraModel: string | null;
  perceptualHash: string;
  capturedInApp: boolean;
  width: number;
  height: number;
  /** The untouched EXIF dict, stored alongside the three fields parsed out
   * of it (post_media.exif_raw). Kept so a reviewer can see what was *not*
   * parsed — GPS, orientation, lens, software tags — when a claim looks
   * wrong, rather than that evidence being discarded at upload. */
  exifRaw: Record<string, unknown> | null;
}

export interface UploadedCatchPhoto extends PreparedCatchPhoto {
  storagePath: string;
}

function detectHeic(asset: ImagePicker.ImagePickerAsset): boolean {
  const mime = asset.mimeType?.toLowerCase();
  if (mime && HEIC_MIME_TYPES.includes(mime)) return true;
  const name = asset.fileName?.toLowerCase() ?? asset.uri.toLowerCase();
  return HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function toPicked(asset: ImagePicker.ImagePickerAsset, capturedInApp: boolean): PickedCatchPhoto {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    capturedInApp,
    nativeExif: (asset.exif as Record<string, unknown> | undefined) ?? null,
    isHeic: detectHeic(asset),
  };
}

/**
 * Opens the camera roll picker, multi-select up to `remainingSlots`. No
 * mandatory in-app capture — this is the default/primary path.
 */
export async function pickCatchPhotosFromLibrary(remainingSlots: number): Promise<PickedCatchPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: remainingSlots,
    exif: true,
    quality: 1,
  });

  if (result.canceled) return [];
  // selectionLimit isn't enforced on every platform (notably web) — truncate defensively.
  return result.assets.slice(0, remainingSlots).map((asset) => toPicked(asset, false));
}

/** The optional in-app camera option — never mandatory, but photos taken
 * this way are captured_in_app, which raises evidence_tier. */
export async function captureCatchPhoto(): Promise<PickedCatchPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    exif: true,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0], true);
}

async function readUriAsBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

/**
 * Extracts EXIF, computes a perceptual hash, then compresses — strictly in
 * that order. Doing the resize first would silently lose EXIF, since
 * resizing strips it.
 *
 * EXIF extraction is hybrid: on iOS/Android, the picker's own native
 * `exif` dict is used (OS-level extraction via PHAsset/ExifInterface,
 * which correctly reads HEIC's embedded EXIF — iPhones shoot HEIC by
 * default). On web, expo-image-picker never populates that field, so this
 * falls back to parsing the raw JPEG bytes directly — a real gap for HEIC
 * specifically on web, but browsers rarely hand a raw HEIC blob through a
 * file picker in the first place.
 */
export async function prepareCatchPhoto(photo: PickedCatchPhoto): Promise<PreparedCatchPhoto> {
  const exif =
    Platform.OS === 'web'
      ? extractExifFromBytes(await readUriAsBytes(photo.uri))
      : extractExifFromNativeDict(photo.nativeExif);

  const hashSource = await manipulateAsync(photo.uri, [{ resize: HASH_RESIZE }], {
    format: SaveFormat.JPEG,
    compress: 1,
  });
  const perceptualHash = computePerceptualHash(await readUriAsBytes(hashSource.uri));

  const uploadWidth = photo.width > 0 ? Math.min(photo.width, UPLOAD_MAX_DIMENSION) : UPLOAD_MAX_DIMENSION;
  let uploadBytes: ArrayBuffer | null = null;
  for (const quality of UPLOAD_QUALITY_STEPS) {
    const compressed = await manipulateAsync(photo.uri, [{ resize: { width: uploadWidth } }], {
      format: SaveFormat.JPEG,
      compress: quality,
    });
    const bytes = await readUriAsBytes(compressed.uri);
    uploadBytes = bytes;
    if (bytes.byteLength <= UPLOAD_TARGET_BYTES) break;
  }

  return {
    uploadBytes: uploadBytes!,
    exifTakenAt: exif.takenAt,
    exifCameraMake: exif.cameraMake,
    exifCameraModel: exif.cameraModel,
    perceptualHash,
    capturedInApp: photo.capturedInApp,
    width: photo.width,
    height: photo.height,
    exifRaw: photo.nativeExif,
  };
}

/**
 * Uploads under {user_id}/{post_id}/{filename} — post_id is generated
 * client-side (see uuid.ts) before any of this runs, so the path is known
 * ahead of the submit_catch RPC call that will reference it.
 */
export async function uploadCatchPhoto(
  prepared: PreparedCatchPhoto,
  userId: string,
  postId: string,
  index: number
): Promise<UploadedCatchPhoto> {
  const path = `${userId}/${postId}/${index}.jpg`;
  const { error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, prepared.uploadBytes, { contentType: 'image/jpeg' });
  if (error) throw error;

  return { ...prepared, storagePath: path };
}
