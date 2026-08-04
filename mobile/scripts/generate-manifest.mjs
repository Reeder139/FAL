// Writes public/manifest.webmanifest, resolving URLs against
// EXPO_PUBLIC_SITE_URL.
//
// Run from mobile/ before `expo export`:
//   EXPO_PUBLIC_SITE_URL=https://www.carpleagues.com node scripts/generate-manifest.mjs
//
// Why generated rather than hand-written with the domain baked in: the
// manifest's `scope` is what decides whether an installed app stays inside
// its own window. Pin it to the production domain and every preview
// deployment becomes un-installable — the page's origin is outside the
// scope it declares, so the browser refuses. Preview builds want the
// preview's own origin, or none at all.
//
// With EXPO_PUBLIC_SITE_URL unset, everything falls back to root-relative
// paths, which resolve against whatever origin serves the file. That is the
// safest default and is what makes an unconfigured build still installable.
//
// The output is committed (in its relative form) so the repo is never
// missing a manifest, but a release build should regenerate it.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('public', 'manifest.webmanifest');

const site = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
/** Absolute against the site URL when there is one, root-relative when not. */
const url = (p) => `${site}${p}`;

const manifest = {
  name: 'Carp Leagues',
  short_name: 'Carp Leagues',
  description: 'Fantasy carp fishing leagues. Real anglers, real fish, real prizes.',
  start_url: url('/'),
  scope: url('/'),
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#070D14',
  theme_color: '#070D14',
  icons: [
    { src: url('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
    { src: url('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
  ],
};

await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}  (site URL: ${site || '<unset — relative paths>'})`);
