// Generates the home-screen icons referenced by public/manifest.webmanifest
// and the apple-touch-icon link in src/app/+html.tsx.
//
// Source is the prepared Carp Leagues logo, not assets/images/icon.png —
// that one is still the stock Expo scaffold icon (a blue chevron) and has
// never been FAL artwork.
//
// The logo has a transparent backdrop and these must not. iOS composites a
// transparent touch icon onto black and then applies its own rounded-rect
// mask, so the result is a black tile with the mark floating in it; Android
// letterboxes it against whatever the launcher feels like. Flattening onto
// the app's own background colour makes the tile deliberate rather than
// incidental, and matches the splash the app opens to.
//
// Run from mobile/:  node scripts/prepare-web-icons.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run if the logo or
// the background colour changes.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('assets', 'images', 'login', 'carp-leagues-logo.png');
const OUT_DIR = path.resolve('public', 'icons');

/** Must stay in step with `backgroundColor` in app.json and Colors.dark's
 * background in constants/theme.ts — this is the same near-black navy, and
 * a tile in a different one reads as a rendering fault next to the splash. */
const BACKGROUND = { r: 0x07, g: 0x0d, b: 0x14, alpha: 1 };

/** Fraction of the tile the artwork spans. Short of full bleed on purpose:
 * iOS rounds the corners off a touch icon and Android may crop further, so
 * a mark taken to the edge loses its points. */
const INSET_SCALE = 0.84;

const TARGETS = [
  // The two the manifest declares. 192 is the install prompt and the
  // launcher; 512 is the splash Android generates from the manifest.
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // iOS ignores the manifest's icons for the home screen and uses this
  // link instead. 180 is the largest size it asks for.
  { file: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { file, size } of TARGETS) {
    const inner = Math.round(size * INSET_SCALE);
    const art = await sharp(SRC)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const offset = Math.round((size - inner) / 2);
    await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
      .composite([{ input: art, top: offset, left: offset }])
      .png()
      .toFile(path.join(OUT_DIR, file));

    console.log(`${file}  ${size}x${size}  (artwork ${inner}px)`);
  }

  console.log(`wrote ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
