// Prepares the backdrop images behind the division cards, from the source
// art in <repo>/Images/general pics/.
//
// Two problems to solve, neither of which a plain resize handles.
//
// 1. Framing. The sources are portrait (0.9:1) and the cards are wide —
//    1.94:1 on a phone, 4.27:1 on desktop — so most of each picture has to
//    go. Which part matters: centre-cropping a portrait shot of a lake keeps
//    the water and throws away the sky and the treeline. sharp's `attention`
//    strategy picks the region with the most going on in it instead, which
//    is as close to "the best bit" as this can get without a human.
//
// 2. Exposure. These range from near-black baits to a bright midday sky. The
//    card's text sits on top of all of them, so a single scrim in the app
//    can't be right for both — tuned for the sky it buries the dark shots,
//    tuned for the dark ones the sky washes the text out. So each image is
//    measured and pushed towards a common mean brightness here, and the app
//    then applies one moderate scrim over a set that's already consistent.
//
// Run from mobile/:  node scripts/prepare-division-backdrops.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes, and keep DIVISION_BACKDROPS in divisions.tsx in step with the
// filenames printed below.

import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images', 'general pics');
const OUT_DIR = path.resolve('assets', 'images', 'divisions');

/** Between the phone's 1.94:1 and desktop's 4.27:1. Whichever way `cover`
 * has to crop at render time, it's trimming from a frame that already holds
 * the subject rather than hunting for it. */
const TARGET_RATIO = 2.5;
const TARGET_WIDTH = 900;
/** Mean luminance every backdrop is pulled towards, 0-255. Low: these sit
 * behind white headings and a coloured PB range, and the app's scrim adds
 * only a moderate amount on top. */
const TARGET_MEAN_LUM = 62;
/** Bounds on the correction, so a nearly-black source isn't hauled up into
 * grey mush and a blown-out one isn't crushed flat. */
const MIN_GAIN = 0.35;
const MAX_GAIN = 1.6;
const QUALITY = 78;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function meanLuminance(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let total = 0;
  let n = 0;
  // Every 4th pixel — plenty for a mean, a quarter of the work.
  for (let i = 0; i < width * height; i += 4) {
    const p = i * channels;
    total += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    n++;
  }
  return total / n;
}

async function prepare(srcName, outName) {
  const src = path.join(SRC_DIR, srcName);

  const cropped = await sharp(src)
    .resize({
      width: TARGET_WIDTH,
      height: Math.round(TARGET_WIDTH / TARGET_RATIO),
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .toBuffer();

  const before = await meanLuminance(cropped);
  const gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_MEAN_LUM / before));

  const out = path.join(OUT_DIR, outName);
  await sharp(cropped).modulate({ brightness: gain }).jpeg({ quality: QUALITY, mozjpeg: true }).toFile(out);

  const after = await meanLuminance(await sharp(out).toBuffer());
  const srcSize = (await stat(src)).size;
  const outSize = (await stat(out)).size;
  console.log(
    `  ${srcName.padEnd(28)} lum ${before.toFixed(0).padStart(3)} -> ${after.toFixed(0).padStart(3)}` +
      ` (gain ${gain.toFixed(2)})  ${kb(srcSize)} -> ${kb(outSize)}  ${outName}`
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SRC_DIR)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  if (files.length === 0) throw new Error(`no images in ${SRC_DIR}`);

  const names = [];
  for (let i = 0; i < files.length; i++) {
    const outName = `backdrop-${String(i + 1).padStart(2, '0')}.jpg`;
    await prepare(files[i], outName);
    names.push(outName);
  }
  console.log(`\n${names.length} backdrops written to assets/images/divisions/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
