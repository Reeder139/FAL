// Prepares the Fair Play Code header from the source art in <repo>/Images/.
//
// The plaque sits in a wide band through the middle of a 1536x1024 black
// canvas, using barely half its height. Shipped uncropped it would reserve a
// square of screen to show a letterbox, and on the fair-play screen that is
// the space the code itself needs.
//
// Cropped by luminance rather than by keying a colour: the surround is flat
// black and the plaque is gold on near-black, so "brighter than the
// background" finds the plaque's outer edge exactly, where a colour test
// would also have to reason about the dark honeycomb inside it.
//
// The backdrop is left opaque black. This header sits on the app's own
// near-black (#070D14) at full width, so the join is invisible, and keying it
// out would mean feathering a soft gold glow that has nowhere to fade to.
//
// Run from mobile/:  node scripts/prepare-fair-play-header.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'Login page assets', 'fair play header.png');
const OUT_DIR = path.resolve('assets', 'images');
const OUT = path.join(OUT_DIR, 'fair-play-header.jpg');

/** Above this luminance a pixel is plaque, not backdrop. Low, because the
 * plaque's outermost bevel is a dim gold line and cropping inside it would
 * shave the frame. */
const INK_LUMA = 26;
/** A row or column needs this many lit pixels to count as part of the
 * plaque — one stray compression artefact should not widen the crop. */
const MIN_LIT = 8;
/** Bundled width. ~2.5x the widest the header is ever drawn. */
const OUT_WIDTH = 1100;
const QUALITY = 86;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const lit = (x, y) => {
    const i = (y * width + x) * channels;
    return luma(data[i], data[i + 1], data[i + 2]) > INK_LUMA;
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  const rowLit = (y) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (lit(x, y) && ++n >= MIN_LIT) return true;
    return false;
  };
  const colLit = (x) => {
    let n = 0;
    for (let y = 0; y < height; y++) if (lit(x, y) && ++n >= MIN_LIT) return true;
    return false;
  };

  while (top < bottom && !rowLit(top)) top++;
  while (bottom > top && !rowLit(bottom)) bottom--;
  while (left < right && !colLit(left)) left++;
  while (right > left && !colLit(right)) right--;

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;

  const out = await sharp(SRC)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: OUT_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY })
    .toFile(OUT);

  console.log(`${width}x${height} -> cropped ${cropW}x${cropH} -> ${out.width}x${out.height}`);
  console.log(`ratio ${(out.width / out.height).toFixed(4)}  (put this in fair-play.tsx)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
