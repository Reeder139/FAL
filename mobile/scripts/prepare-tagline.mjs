// Prepares the "Real Anglers | Real Fish | Real Prizes" tagline for the tab
// template from the source art in <repo>/Images/.
//
// Unlike the join banner, this one needs no keying: the source already ships
// a real alpha channel, and only ~4% of its pixels are opaque. The orange
// field you see previewing the file is the RGB sitting *underneath* the
// transparent region, which flattening viewers show and compositors don't.
// So this only has to find the opaque content and crop to it — the 1536x1024
// canvas is almost entirely empty space, and shipping it whole would mean
// bundling a 2MB image to draw a 40px-tall strapline.
//
// Run from mobile/:  node scripts/prepare-tagline.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'tag line.png');
const OUT_DIR = path.resolve('assets', 'images');
const OUT = path.join(OUT_DIR, 'tagline.png');

/** Alpha at or below this counts as empty canvas. Low rather than zero so
 * the crop keeps the text's antialiased edge and its soft drop shadow —
 * cropping to fully-opaque pixels only would shave the glow and leave the
 * letterforms looking cut out. */
const ALPHA_FLOOR = 16;
/** Bundled width. The tagline spans the content column, which caps at
 * MaxContentWidth (800), so this is a little over 1.5x on the widest
 * layout. The source can't give more — its opaque content is 1324px wide
 * and enlarging would only soften it. */
const TARGET_WIDTH = 1320;

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
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(OUT);

  const before = (await stat(SRC)).size;
  const after = (await stat(OUT)).size;
  const outMeta = await sharp(OUT).metadata();

  console.log(`  source   ${w}x${h}  ${kb(before)}`);
  console.log(`  cropped  ${cropW}x${cropH}  (ratio ${(cropW / cropH).toFixed(3)})`);
  console.log(`  output   ${outMeta.width}x${outMeta.height}  ${kb(after)}  alpha=${outMeta.hasAlpha}`);
  console.log(`  ratio to use in code: ${outMeta.width} / ${outMeta.height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
