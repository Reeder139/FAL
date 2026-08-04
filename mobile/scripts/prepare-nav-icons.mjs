// Prepares the bottom nav bar's icons from the source art in
// <repo>/Images/nav icons new/.
//
// Each source is a 768x768 canvas with the symbol floating small in the
// middle of it — between 198 and 274px of actual ink, so roughly a third of
// the frame. Shipping the canvas whole would mean the bar renders mostly
// empty space and the symbol comes out about a third of its intended size.
//
// So each is cropped to its own ink and padded back to a common square. The
// padding matters as much as the crop: the symbols range from 0.98 to 1.26
// in aspect, and squaring them at a shared size is what stops the podium
// (widest) out-weighing the profile ring (tallest) once they sit side by
// side at identical box sizes.
//
// The activity icon is the exception and is handled in the bar, not here:
// at 1.63:1 it's far wider than the rest, so squaring it leaves the artwork
// filling only ~61% of the box height and reading as a smaller icon. The bar
// renders it in a wider box to compensate — see NavIconSizeWide.
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

const SRC_DIR = path.resolve('..', 'Images', 'nav icons new');
const OUT_DIR = path.resolve('assets', 'images', 'nav');

/** Source file -> bundled name. The numeric prefixes are the order the art
 * was delivered in, not the nav order — see app-tabs.web.tsx for that.
 *
 * divisions and leaders are still built even though the bar no longer shows
 * them: they moved to options on the league page, and the art is 3-7KB each.
 */
const ICONS = [
  ['01_feed_symbol.png', 'feed.png'],
  ['02_national_league_symbol.png', 'national-league.png'],
  ['03_divisions_symbol.png', 'divisions.png'],
  ['04_leaders_symbol.png', 'leaders.png'],
  ['05_profile_symbol.png', 'profile.png'],
  ['activity.png', 'activity.png'],
];

/** Alpha at or below this counts as empty canvas. Low, so the crop keeps
 * each symbol's antialiased edge, glow and drop shadow. */
const ALPHA_FLOOR = 16;
/** Bundled size. The bar renders these at NavIconSize (32), so this is 4x
 * for the densest screens. */
const TARGET_SIZE = 128;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function prepare(srcName, outName) {
  const src = path.join(SRC_DIR, srcName);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  if (maxX < 0) throw new Error(`${src}: nothing above alpha ${ALPHA_FLOOR}`);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = path.join(OUT_DIR, outName);

  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .resize({
      width: TARGET_SIZE,
      height: TARGET_SIZE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(out);

  const before = (await stat(src)).size;
  const after = (await stat(out)).size;
  console.log(
    `  ${srcName.padEnd(31)} ink ${String(cropW).padStart(3)}x${String(cropH).padStart(3)}` +
      ` (ratio ${(cropW / cropH).toFixed(2)})  ->  ${outName.padEnd(20)} ${kb(before)} -> ${kb(after)}`
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [srcName, outName] of ICONS) await prepare(srcName, outName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
