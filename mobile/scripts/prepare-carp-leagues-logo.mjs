// Prepares the Carp Leagues logo for the welcome screen from the source art
// in <repo>/Images/.
//
// The app is officially Carp Leagues now, trading under the Fantasy Angling
// banner — so this replaces the logo on the welcome screen only. Everything
// else (the strapline, the League Position strip, the nav artwork) still
// says Fantasy Angling and is meant to.
//
// The source arrives as a 1254x1254 opaque PNG on flat black, where the old
// logo was a 512x512 PNG with real transparency. Dropped in as-is it would
// read as a black square sitting on the lake photograph.
//
// Keying the black out needs the same care as the join banner: a plain
// "black -> transparent" pass would punch straight through the shield's
// dark interior, the fish's shadowed flank and the outlines around the
// lettering, all of which are as dark as the backdrop. So this flood-fills
// inward from the border and clears only what's actually connected to the
// edge; anything enclosed by the shield is untouched however dark it is.
//
// The thresholds have to be tight, and measurement rather than taste is
// what sets them. The backdrop is pure black — luma 0-2 across the whole
// outer frame — while the artwork's edges spike to ~170 at the shield's
// bevel. But the banner's own interior also sits at luma 0-4, so a generous
// threshold doesn't just risk a leak, it guarantees one: the fill walks in
// along any soft stretch of outline and hollows the logo out from inside.
// Keeping the wall at 12 stops it at every real edge.
//
// A tight cutoff leaves the anti-aliased band opaque, i.e. a dark fringe.
// That's deliberate: the fringe is black-on-near-black against this screen's
// artwork, so it costs nothing visible, where un-premultiplying it — the
// usual fix — divides near-zero colour by near-zero alpha and blows the
// shield's dark interior out to white.
//
// Run from mobile/:  node scripts/prepare-carp-leagues-logo.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the
// source art changes.

import path from 'node:path';

import sharp from 'sharp';

const SRC = path.resolve('..', 'Images', 'Login page assets', 'Carp Leagues Logo.png');
const OUT = path.resolve('assets', 'images', 'login', 'carp-leagues-logo.png');

/** Luminance at or below this is certainly backdrop — fully cleared.
 * Measured: the outer frame runs 0-2 with no tail. */
const CLEAR_BELOW = 2;
/** Luminance at or above this is certainly artwork — the flood stops here.
 * Between the two, alpha ramps. Kept just above the backdrop's ceiling
 * rather than somewhere comfortable in the gap, because the banner's
 * interior is as dark as the backdrop and anything looser lets the fill
 * walk in along a soft stretch of outline and hollow the logo out. */
const KEEP_ABOVE = 12;
/** Alpha at or below this counts as empty when working out the crop box. */
const ALPHA_FLOOR = 8;
/** Matches the old logo.png, and so LOGO_RATIO = 1 in welcome.tsx. The
 * source is square and the artwork nearly fills it, so the trimmed result
 * is padded back to square rather than being allowed to change ratio. */
const OUT_SIZE = 512;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => (y * width + x) * channels;

  // Flood fill from every border pixel. An explicit stack, not recursion —
  // this is 1.5M pixels and the call stack would not survive it.
  const cleared = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (cleared[idx]) return;
    const i = at(x, y);
    if (luma(data[i], data[i + 1], data[i + 2]) >= KEEP_ABOVE) return;
    cleared[idx] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  // Alpha only — the colour is left exactly as it arrived. See the note at
  // the top on why un-premultiplying is the wrong move here.
  for (let idx = 0; idx < cleared.length; idx++) {
    if (!cleared[idx]) continue;
    const i = idx * channels;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = l <= CLEAR_BELOW ? 0 : Math.round(((l - CLEAR_BELOW) / (KEEP_ABOVE - CLEAR_BELOW)) * 255);
  }

  // Crop box from the alpha we just wrote, so the output carries no dead
  // margin — the screen caps the logo's width, and margin baked into the
  // asset is width the artwork doesn't get to use.
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[at(x, y) + 3] <= ALPHA_FLOOR) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) throw new Error('Everything was keyed out — check CLEAR_BELOW/KEEP_ABOVE.');

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;

  // Fit inside a square canvas rather than resizing to one: the artwork is
  // wider than it is tall once trimmed, and squashing it to square would
  // distort the shield.
  await sharp(Buffer.from(data), { raw: { width, height, channels } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(OUT);

  console.log(`${width}x${height} -> trimmed ${cropW}x${cropH} -> ${OUT_SIZE}x${OUT_SIZE}`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
