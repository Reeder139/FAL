import ExifParser from 'exif-parser';

export interface ExifResult {
  takenAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

const EMPTY_RESULT: ExifResult = { takenAt: null, cameraMake: null, cameraModel: null };

/** Parses EXIF's "YYYY:MM:DD HH:MM:SS" date format (no timezone — treated as UTC,
 * same approximation exif-parser makes; fine given the 7-day flag tolerance). */
function parseExifDateString(value: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Parses EXIF from raw JPEG bytes via exif-parser (pure-JS, JPEG/TIFF only —
 * does not understand HEIC's box-based container at all, silently returning
 * empty tags rather than erroring). This is the fallback path for web,
 * where expo-image-picker doesn't extract EXIF itself (see
 * catchPhoto.ts/extractExifForPhoto for the native path, which uses the
 * picker's own OS-level EXIF — and does correctly understand HEIC, since
 * that's iOS's own image pipeline doing the reading).
 *
 * Must run on the *original* file — never a resized/compressed copy, since
 * resizing strips EXIF. Missing EXIF is expected and returned as nulls, not
 * thrown — submit_catch flags for review rather than blocking on it.
 */
export function extractExifFromBytes(bytes: ArrayBuffer): ExifResult {
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

/**
 * Parses the `exif` dict expo-image-picker returns natively on iOS/Android
 * when launched with `exif: true`. This is OS-level extraction (PHAsset/
 * ImageIO on iOS, ExifInterface on Android), so — unlike extractExifFromBytes
 * — it correctly reads HEIC's embedded EXIF too, since HEIC is Apple's own
 * format and iOS's own image APIs handle it natively.
 *
 * The dict's exact shape isn't fully consistent across OS versions (iOS in
 * particular sometimes nests fields under "{TIFF}"/"{Exif}" keys, sometimes
 * flattens them), so this checks both locations defensively rather than
 * assuming one.
 */
export function extractExifFromNativeDict(exif: Record<string, unknown> | null | undefined): ExifResult {
  if (!exif) return EMPTY_RESULT;

  const tiff = (exif['{TIFF}'] as Record<string, unknown> | undefined) ?? exif;
  const exifBlock = (exif['{Exif}'] as Record<string, unknown> | undefined) ?? exif;

  const make = tiff.Make ?? exif.Make;
  const model = tiff.Model ?? exif.Model;
  const dateTimeOriginal =
    exifBlock.DateTimeOriginal ?? exif.DateTimeOriginal ?? tiff.DateTime ?? exif.DateTime;

  return {
    takenAt: typeof dateTimeOriginal === 'string' ? parseExifDateString(dateTimeOriginal) : null,
    cameraMake: typeof make === 'string' ? make.trim() || null : null,
    cameraModel: typeof model === 'string' ? model.trim() || null : null,
  };
}
