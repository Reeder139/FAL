import ExifParser from 'exif-parser';

export interface ExifResult {
  takenAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

const EMPTY_RESULT: ExifResult = { takenAt: null, cameraMake: null, cameraModel: null };

/**
 * Parses EXIF from raw image bytes. Must run on the *original* file — never
 * on a resized/compressed copy, since resizing strips EXIF. Missing EXIF
 * (screenshots, web-stripped uploads, some Android camera apps) is expected
 * and returned as nulls, not thrown — the server-side trigger decides what
 * to do with a null takenAt (flag for review), not the client.
 */
export function extractExif(bytes: ArrayBuffer): ExifResult {
  try {
    const tags = ExifParser.create(bytes).parse().tags;
    const takenAtSeconds = tags.DateTimeOriginal ?? tags.CreateDate;

    return {
      takenAt: typeof takenAtSeconds === 'number' ? new Date(takenAtSeconds * 1000).toISOString() : null,
      cameraMake: typeof tags.Make === 'string' ? tags.Make.trim() || null : null,
      cameraModel: typeof tags.Model === 'string' ? tags.Model.trim() || null : null,
    };
  } catch {
    return EMPTY_RESULT;
  }
}
