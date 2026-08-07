// Prepares the bottom nav bar's icons from the source art under <repo>/Images.
//
// Each source is a canvas with the symbol floating small in the middle of it —
// between 198 and 274px of actual ink, so roughly a third of the frame.
// Shipping the canvas whole would mean the bar renders mostly empty space and
// the symbol comes out about a third of its intended size.
//
// So each is cropped to its own ink and padded back to a common square. The
// padding matters as much as the crop: the symbols range from 0.83 to 1.26
// in aspect, and squaring them at a shared size is what stops the podium
// (widest) out-weighing the bell (tallest) once they sit side by side at
// identical box sizes.
//
// An earlier set of this artwork had each tab's name baked in underneath the
// symbol, which this script cropped off. These replacements are symbol-only,
// so there's nothing to strip — but the nav bar is still icon-only, and the
// tab names still live on as accessibility labels rather than as pixels.
//
// Run from mobile/:  node scripts/prepare-nav-icons.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images');
const OUT_DIR = path.resolve('assets', 'images', 'nav');

/** Source file (relative to Images/) -> bundled name. The numeric prefixes are
 * the order the art was delivered in, not the nav order — see app-tabs.web.tsx
 * for that.
 *
 * divisions and leaders are still built even though the bar no longer shows
 * them: they moved to options on the league page, and the art is 3-7KB each.
 */
const ICONS = [
  ['nav icons new/01_feed_symbol.png', 'feed.png', { square: true }],
  ['nav icons new/02_national_league_symbol.png', 'national-league.png', { square: true }],
  ['nav icons new/03_divisions_symbol.png', 'divisions.png', { square: true }],
  ['nav icons new/04_leaders_symbol.png', 'leaders.png', { square: true }],
  ['nav icons new/05_profile_symbol.png', 'profile.png', { square: true }],
  // The bell replaces an earlier composite of a heart, a bell and a "1"
  // notification bubble. The composite was 1.63:1 and needed its own wider box
  // in the bar to stay legible, and its baked-in "1" claimed an unread count
  // whether or not there was one — the bar now draws a real badge from
  // activity_unread_count() instead. This one is a plain JPEG on black, hence
  // keyBlack.
  ['Nav Icons/bell.jpeg', 'activity.png', { square: true, keyBlack: true }],
];

/** Alpha at or below this counts as empty canvas. Low, so the crop keeps
 * each symbol's antialiased edge, glow and drop shadow. */
const ALPHA_FLOOR = 16;
/** Brightness either side of which a keyBlack source is fully transparent or
 * fully opaque, with a ramp between. The floor sits above JPEG noise in the
 * black surround; the ceiling is low enough that the bell's own shaded flank
 * stays solid rather than being mistaken for background. */
const KEY_FLOOR = 6;
const KEY_CEIL = 45;
/** Bundled size. The bar renders these at NavIconSize (32), so this is 4x
 * for the densest screens. */
const TARGET_SIZE = 128;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

/**
 * Turns a black surround into transparency, in place.
 *
 * The art is lit gold on black with no alpha channel, which is the same thing
 * as gold already composited over black. So the recovery is the inverse of
 * that composite: take alpha from brightness, then divide the colour back out
 * by it. Without that division every glow pixel stays a muddy dark gold that
 * only looks right on a black background — un-premultiplying gives back the
 * bright gold at low opacity, which looks right on any of them.
 *
 * Brightness here is the max channel, not luminance. Luminance weights green
 * heavily and gold is mostly red, so the bell's shaded flank scored low enough
 * to be read as background: it came out semi-transparent, and the division
 * above then blew it out to near-white on a light surface.
 */
function keyOutBlack(data, pixels, channels) {
  for (let p = 0; p < pixels; p++) {
    const i = p * channels;
    const v = Math.max(data[i], data[i + 1], data[i + 2]);
    const a = Math.min(1, Math.max(0, (v - KEY_FLOOR) / (KEY_CEIL - KEY_FLOOR)));
    data[i + 3] = Math.round(a * 255);
    if (a > 0) {
      data[i] = Math.min(255, Math.round(data[i] / a));
      data[i + 1] = Math.min(255, Math.round(data[i + 1] / a));
      data[i + 2] = Math.min(255, Math.round(data[i + 2] / a));
    }
  }
}

async function prepare(srcName, outName, { square, keyBlack = false }) {
  const src = path.join(SRC_DIR, srcName);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  if (keyBlack) keyOutBlack(data, w * h, channels);

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
  if (maxX < 0) throw new Error(`${src}: nothing above alpha ${ALPHA_FLOOR}`);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = path.join(OUT_DIR, outName);

  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize(
      square
        ? { width: TARGET_SIZE, height: TARGET_SIZE, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        : { width: TARGET_SIZE }
    )
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(out);

  const before = (await stat(src)).size;
  const after = (await stat(out)).size;
  const outMeta = await sharp(out).metadata();
  console.log(
    `  ${srcName.padEnd(42)} ink ${String(cropW).padStart(3)}x${String(cropH).padStart(3)}` +
      ` (ratio ${(cropW / cropH).toFixed(2)})  ->  ${outName.padEnd(20)}` +
      ` ${outMeta.width}x${outMeta.height}  ${kb(before)} -> ${kb(after)}`
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [srcName, outName, opts] of ICONS) await prepare(srcName, outName, opts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
