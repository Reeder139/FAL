// Prepares the "Join the League" banner for the League Position strip from
// the source art in <repo>/Images/Join League 1.png.
//
// The source needs more than a resize. It's a 1774x887 opaque RGB PNG with
// no alpha at all — the banner occupies a 1743x475 band through the middle
// and everything around it is near-white (253,253,253). Dropped onto the
// strip as-is, that reads as a white box around the banner rather than as
// transparency.
//
// Keying it out needs care: the banner's own headline text is white too, so
// a plain "white -> transparent" pass would punch holes through the
// lettering. Instead this flood-fills inward from the border, so only
// background actually connected to the edge is cleared; anything enclosed
// by the banner (the headline, the trophy highlights) is untouched.
//
// Run from mobile/:  node scripts/prepare-join-banner.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the
// source art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'Join League 1.png');
const OUT_DIR = path.resolve('assets', 'images');
const OUT = path.join(OUT_DIR, 'join-league-banner.png');

/** Anything at or above this on all three channels counts as backdrop. */
const WHITE_CUTOFF = 232;
/** Bundled width. The strip renders it around 170px wide, so this is ~4x
 * for high-density screens without carrying the full source resolution. */
const TARGET_WIDTH = 700;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const isBackdrop = (i) => data[i] >= WHITE_CUTOFF && data[i + 1] >= WHITE_CUTOFF && data[i + 2] >= WHITE_CUTOFF;

  // Flood fill inward from every border pixel. An explicit stack rather
  // than recursion — 1.5M pixels would blow the call stack.
  const cleared = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) {
    stack.push(x, 0, x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    stack.push(0, y, w - 1, y);
  }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (cleared[p]) continue;
    if (!isBackdrop(p * channels)) continue;
    cleared[p] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (cleared[p]) {
        data[p * channels + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(OUT);

  const before = (await stat(SRC)).size;
  const after = (await stat(OUT)).size;
  const outMeta = await sharp(OUT).metadata();

  console.log(`  source   ${w}x${h}  ${kb(before)}`);
  console.log(`  cropped  ${cropW}x${cropH}  (ratio ${(cropW / cropH).toFixed(3)})`);
  console.log(`  output   ${outMeta.width}x${outMeta.height}  ${kb(after)}  alpha=${outMeta.hasAlpha}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
