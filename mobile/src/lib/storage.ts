/**
 * Deliberately independent of supabase.ts: that module creates the auth
 * client as a side effect of being imported at all, which touches
 * window/AsyncStorage and breaks this app's web SSR pass (app.json has
 * web.output: "static"). This file only needs the project URL, so it stays
 * a plain string utility with no client import.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL — set it in .env (see .env.example).');
}

/**
 * Resolves a storage path (e.g. `profiles.avatar_path`, a `post_media.storage_path`)
 * to a displayable URL. Only correct for buckets configured as public — a
 * private bucket needs a signed URL instead, fetched per-request via
 * `supabase.storage.from(bucket).createSignedUrl(path, expiresIn)`.
 */
export function getPublicStorageUrl(bucket: string, path: string): string {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
