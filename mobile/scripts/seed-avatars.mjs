// One-off dev seeding script — gives every profile without one a generated
// avatar, so the feed, the suggested-accounts rail, search results and the
// league tables render with faces instead of empty discs.
//
// The avatars are generated here rather than downloaded: initials on a
// coloured disc, drawn as SVG and rasterised by sharp. That keeps the seed
// self-contained (no third-party avatar service, no licensing question over
// stock photos of real people) and deterministic — the same username always
// gets the same colour, so re-running doesn't reshuffle everyone.
//
// Skips any profile that already has an avatar_path, so it's safe to re-run
// and won't overwrite a real angler's own picture.
//
// Never commit a service_role key. Pass it (and the project URL) as env vars
// at invocation time only:
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
//     node scripts/seed-avatars.mjs [--force]
//
// Requires sharp:  npm install --no-save sharp
//
// Uploads to the post-media bucket under avatars/<user-id>.png. That bucket
// is public-read, which is what makes getPublicStorageUrl() work for these.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FORCE = process.argv.includes('--force');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SIZE = 256;
const BUCKET = 'post-media';

/** Backgrounds drawn from the app's own palette (see constants/theme.ts) so
 * the rail reads as one set rather than a bag of random hues. Deliberately
 * mid-to-deep tones: the avatars sit inside a gold ring on a dark
 * background, and pale discs blow that contrast out. */
const BACKGROUNDS = [
  '#0E93AD', // deep cyan
  '#5B21B6', // deep violet
  '#125EA3', // ocean blue deep
  '#1E5F4B', // deep green
  '#8A4B1F', // bronze-brown
  '#3B4E66', // slate
  '#7A2E4A', // deep rose
  '#26547C', // navy
];

/** Stable hash so a given username always lands on the same colour. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function initials(displayName, username) {
  const source = (displayName || username || '?').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

async function avatarPng(displayName, username) {
  const bg = BACKGROUNDS[hash(username) % BACKGROUNDS.length];
  const text = initials(displayName, username);
  // A disc rather than a full-bleed square: the app renders avatars with
  // borderRadius anyway, but a circle in the file means the corners stay
  // transparent wherever it's shown un-rounded.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="${bg}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
          font-family="Segoe UI, Helvetica, Arial, sans-serif"
          font-size="${Math.round(SIZE * 0.4)}" font-weight="700"
          fill="#FFFFFF" letter-spacing="2">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, username, display_name, avatar_path')
    .order('username');
  if (error) throw error;

  const targets = FORCE ? profiles : profiles.filter((p) => !p.avatar_path);
  console.log(
    `${profiles.length} profiles, ${profiles.length - targets.length} already have an avatar — ` +
      `generating ${targets.length}${FORCE ? ' (forced)' : ''}...`
  );

  let ok = 0;
  for (const p of targets) {
    const png = await avatarPng(p.display_name, p.username);
    const path = `avatars/${p.id}.png`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, png, { contentType: 'image/png', upsert: true });
    if (upErr) {
      console.error(`  [${p.username}] upload failed:`, upErr.message);
      continue;
    }

    const { error: updErr } = await admin.from('profiles').update({ avatar_path: path }).eq('id', p.id);
    if (updErr) {
      console.error(`  [${p.username}] profile update failed:`, updErr.message);
      continue;
    }
    ok++;
  }

  console.log(`Done. ${ok}/${targets.length} avatars set.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
