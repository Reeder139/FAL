// Prepares the feed's member-search icon from the source art in <repo>/Images/.
//
// Like the tagline, the source already carries a real alpha channel, so this
// needs no keying — just a crop and a resize. The 512x512 canvas has the
// glass sitting off-centre in a 374x394 box, which would render as a
// lopsided, undersized icon if used as-is next to the feed tabs.
//
// Padded back out to a square after cropping, rather than left at the
// artwork's own ratio: the icon sits in a square tap target, and a square
// asset means the component can be a plain fixed-size Image with no aspect
// ratio to thread through it.
//
// Run from mobile/:  node scripts/prepare-search-icon.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'search.png');
const OUT_DIR = path.resolve('assets', 'images');
const OUT = path.join(OUT_DIR, 'search-icon.png');

/** Alpha at or below this counts as empty canvas — low, so the crop keeps
 * the glass's antialiased edge and its soft shadow. */
const ALPHA_FLOOR = 16;
/** Bundled size. The icon renders around 24px, so this is 4x for the
 * densest screens. */
const TARGET_SIZE = 96;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * channels + 3] <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`${SRC} has no pixels above alpha ${ALPHA_FLOOR}`);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize({
      width: TARGET_SIZE,
      height: TARGET_SIZE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(OUT);

  const before = (await stat(SRC)).size;
  const after = (await stat(OUT)).size;
  const outMeta = await sharp(OUT).metadata();

  console.log(`  source   ${w}x${h}  ${kb(before)}`);
  console.log(`  cropped  ${cropW}x${cropH}`);
  console.log(`  output   ${outMeta.width}x${outMeta.height}  ${kb(after)}  alpha=${outMeta.hasAlpha}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
