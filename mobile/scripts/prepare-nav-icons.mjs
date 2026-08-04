// Prepares the bottom nav bar's icons from the source art in
// <repo>/Images/NAV icons/.
//
// Each source is a 768x768 canvas holding two separate things: the glyph,
// and the tab's name baked in underneath it as artwork (a 68px-tall caption
// at y675-742 in every file). Only the glyph survives this script.
//
// The caption has to go because it cannot physically work at tab size. Five
// tabs plus the raised Catch button leave roughly 47px of width each at
// phone width, and the caption is 68/768 of the canvas height — about 4px
// tall once scaled to fit. Making it legible (~9px) would need the icon to
// be over 100px wide, more than double the space a tab has. The tab names
// live on as accessibility labels instead, so screen readers still announce
// them.
//
// The glyphs aren't uniform — they range from 0.80 to 1.11 in aspect and
// occupy different fractions of their canvas — so each is cropped to its own
// ink and padded back to a common square. Without that, the podium (wide)
// would out-weigh the feed page (tall) in the bar even at identical box
// sizes.
//
// Run from mobile/:  node scripts/prepare-nav-icons.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images', 'NAV icons');
const OUT_DIR = path.resolve('assets', 'images', 'nav');

/** Source file -> bundled name. The numeric prefixes are the nav order. */
const ICONS = [
  ['01_feed.png', 'feed.png'],
  ['02_national_league.png', 'national-league.png'],
  ['03_divisions.png', 'divisions.png'],
  ['04_leaders.png', 'leaders.png'],
  ['05_profile.png', 'profile.png'],
];

/** Alpha at or below this counts as empty canvas. Low, so the crop keeps
 * each glyph's antialiased edge and drop shadow. */
const ALPHA_FLOOR = 16;
/** Bundled size. The bar renders these at NavIconSize (32), so this is 4x
 * for the densest screens. */
const TARGET_SIZE = 128;
/** Rows below this fraction of the canvas are the baked caption, not the
 * glyph. The caption sits at y675-742 of 768 in every source, so anything
 * past ~85% is the word; the glyphs all end by y607. */
const CAPTION_CUTOFF = 0.85;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function prepare(srcName, outName) {
  const src = path.join(SRC_DIR, srcName);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const limit = Math.floor(h * CAPTION_CUTOFF);

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * channels + 3] <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`${src}: no glyph above alpha ${ALPHA_FLOOR} before row ${limit}`);

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
    `  ${srcName.padEnd(24)} glyph ${String(cropW).padStart(3)}x${String(cropH).padStart(3)}` +
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
