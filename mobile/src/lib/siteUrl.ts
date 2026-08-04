/**
 * The public origin this build is served from, e.g.
 * `https://www.carpleagues.com` — no trailing slash.
 *
 * Set via `EXPO_PUBLIC_SITE_URL`. Anything that needs an *absolute* URL
 * reads it from here rather than hardcoding a host, so moving domains is a
 * environment change rather than a code change.
 *
 * Undefined when unset, and callers must handle that rather than falling
 * back to a default host. A wrong absolute URL is worse than no absolute
 * URL: for auth redirects Supabase rejects anything not on its allow-list,
 * and a guessed default would send password-reset links to a domain nobody
 * is watching.
 *
 * Note this is a *public* value, inlined into the bundle at build time like
 * every EXPO_PUBLIC_* variable. Never put a secret behind this prefix.
 */
const raw = process.env.EXPO_PUBLIC_SITE_URL;

export const siteUrl: string | undefined = raw ? raw.replace(/\/+$/, '') : undefined;

/** Absolute URL for a path on this site, or undefined if no site URL is
 * configured. `path` should start with a slash. */
export function absoluteUrl(path: string): string | undefined {
  return siteUrl ? `${siteUrl}${path}` : undefined;
}
