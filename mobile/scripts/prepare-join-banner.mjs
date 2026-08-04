// Prepares the "Join the League" banner for the League Position strip from
// the source art in <repo>/Images/.
//
// The source art needs more than a resize. It arrives as an opaque PNG with
// no alpha at all: the banner sits in a band through the middle and
// everything around it is flat backdrop. Dropped onto the strip as-is that
// reads as a coloured box around the banner rather than as transparency.
//
// Keying it out needs care, and the naive approach fails on both versions
// of the art for different reasons — v1's backdrop was near-white and so is
// its headline text, v2's backdrop is the same gold family as the trophy
// and the "20K" lettering. A plain "this colour -> transparent" pass would
// punch holes through the artwork either way. So this samples the backdrop
// from the corners and flood-fills inward from the border, clearing only
// what's actually connected to the edge; anything enclosed by the banner
// body is untouched regardless of its colour.
//
// Run from mobile/:  node scripts/prepare-join-banner.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the
// source art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'Join League 2.png');
const OUT_DIR = path.resolve('assets', 'images');
const OUT = path.join(OUT_DIR, 'join-league-banner.png');

/** How far a pixel may sit from the sampled backdrop colour and still count
 * as backdrop (straight RGB distance). Generous enough to swallow the
 * vignette across v2's gold field — which drifts by ~20 per channel corner
 * to centre — without reaching the near-black banner body. */
const KEY_TOLERANCE = 72;
/** Alpha at or below this counts as empty when working out the crop box. */
const ALPHA_FLOOR = 16;
/** A row (or column) needs opaque pixels covering at least this fraction of
 * the canvas to count as content. Anything thinner is the badge's shadow
 * tapering out — invisible on the dark strip, but enough to stretch the crop
 * box and push the artwork off-centre inside it. */
const SPARSE_FRACTION = 0.02;
/** Alpha a pixel needs to count as the badge proper in the final trim, as
 * opposed to the soft edge left behind by resampling. */
const SOLID_ALPHA = 128;
/** Bundled width. The strip renders it around 170px wide, so this is ~4x
 * for high-density screens without carrying the full source resolution. */
const TARGET_WIDTH = 700;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  // Sample the backdrop from the four corners rather than assuming a
  // colour, so the same pass works whether the art ships on white or on a
  // gold field.
  const at = (x, y) => (y * w + x) * channels;
  const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
  const key = [0, 1, 2].map((ch) => Math.round(corners.reduce((sum, i) => sum + data[i + ch], 0) / corners.length));

  const isBackdrop = (i) => {
    const dr = data[i] - key[0];
    const dg = data[i + 1] - key[1];
    const db = data[i + 2] - key[2];
    return dr * dr + dg * dg + db * db <= KEY_TOLERANCE * KEY_TOLERANCE;
  };

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

  for (let p = 0; p < w * h; p++) {
    if (cleared[p]) data[p * channels + 3] = 0;
  }

  // Crop box comes from the alpha channel, not from the `cleared` flag.
  // Those aren't the same set: the source arrives with transparent regions of
  // its own whose RGB isn't near the sampled backdrop, so the flood fill
  // leaves them alone and a `cleared`-based box counts them as content. That
  // baked 56px of transparent padding into the bottom of the shipped banner
  // and none into the top.
  //
  // A row or column also has to carry real weight to count, not just one
  // stray pixel. The badge trails a soft shadow underneath it that thins to a
  // handful of opaque pixels per row; those rows are invisible against the
  // dark strip but still extended the box downwards, leaving the badge
  // sitting high inside its own frame with ~12px of nothing beneath it. Since
  // the frame is what gets centred in the strip, that read as "more space
  // below than above" and no layout change could reach it.
  const rowCount = new Int32Array(h);
  const colCount = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * channels + 3] <= ALPHA_FLOOR) continue;
      rowCount[y]++;
      colCount[x]++;
    }
  }
  const rowFloor = Math.max(1, Math.round(w * SPARSE_FRACTION));
  const colFloor = Math.max(1, Math.round(h * SPARSE_FRACTION));
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    if (rowCount[y] < rowFloor) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  let minX = w;
  let maxX = -1;
  for (let x = 0; x < w; x++) {
    if (colCount[x] < colFloor) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (maxX < 0 || maxY < 0) throw new Error(`${SRC}: nothing left above alpha ${ALPHA_FLOOR} after keying`);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Resize first, then trim again against the result. The second pass is what
  // actually guarantees the badge is centred in the frame it ships in.
  // Cropping the source tightly isn't enough: downsampling softens the badge's
  // bottom edge more than its top (the shadow is under it, not over it), which
  // left ~5 rows at the bottom of the output too faint to see but still part
  // of the image. Those rows are inside the box the strip centres, so they
  // read as "more space below than above" — measured 0px above the badge
  // against 2.1px below at render size. Trimming the resized pixels to the
  // badge itself removes that by construction, whatever the resampler does.
  const resized = await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rw = resized.info.width;
  const rh = resized.info.height;
  const rc = resized.info.channels;
  const rd = resized.data;
  let sMinX = rw;
  let sMinY = rh;
  let sMaxX = -1;
  let sMaxY = -1;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (rd[(y * rw + x) * rc + 3] < SOLID_ALPHA) continue;
      if (x < sMinX) sMinX = x;
      if (x > sMaxX) sMaxX = x;
      if (y < sMinY) sMinY = y;
      if (y > sMaxY) sMaxY = y;
    }
  }
  if (sMaxX < 0) throw new Error(`${SRC}: nothing above alpha ${SOLID_ALPHA} after resizing`);

  await sharp(rd, { raw: resized.info })
    .extract({ left: sMinX, top: sMinY, width: sMaxX - sMinX + 1, height: sMaxY - sMinY + 1 })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(OUT);

  const before = (await stat(SRC)).size;
  const after = (await stat(OUT)).size;
  const outMeta = await sharp(OUT).metadata();

  console.log(`  source   ${w}x${h}  ${kb(before)}  backdrop rgb(${key.join(',')})`);
  console.log(`  cropped  ${cropW}x${cropH}  (ratio ${(cropW / cropH).toFixed(3)})`);
  console.log(`  output   ${outMeta.width}x${outMeta.height}  ${kb(after)}  alpha=${outMeta.hasAlpha}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
