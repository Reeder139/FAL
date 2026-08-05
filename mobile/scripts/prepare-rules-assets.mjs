// Prepares the two assets behind the rules popup, from the source art in
// <repo>/Images/.
//
// The icon is the same shape of job as the nav icons: it arrives keyed, with
// the artwork floating in the middle of a 1024px canvas using about half of
// it, so it's cropped to its ink and padded back to a square. Squared rather
// than left at its own 1.16:1 because it sits next to the search icon on the
// feed's header row, and a row of icons only looks level if they share a box.
//
// The card is the same job as the convert prompts: an opaque rectangle with
// the artwork inside a gold border and a thin dark margin around it, so this
// finds the border and crops to it rather than hard-coding a box. JPEG for
// the same reason too — photographic and fully opaque, so PNG costs several
// MB for nothing.
//
// Run from mobile/:  node scripts/prepare-rules-assets.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images');
const ICON_OUT_DIR = path.resolve('assets', 'images');
const CARD_OUT_DIR = path.resolve('assets', 'images', 'rules');

const ALPHA_FLOOR = 16;
/** Icon renders at ~28px, so this is 4x for the densest screens. */
const ICON_SIZE = 112;
/** The card is read, not glanced at, so it carries more resolution than the
 * convert prompts — it holds eleven numbered rules in small type. */
const CARD_WIDTH = 1316;
const CARD_QUALITY = 86;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function prepareIcon() {
  const src = path.join(SRC_DIR, 'nav icons new', 'rules icon.png');
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

  const out = path.join(ICON_OUT_DIR, 'rules-icon.png');
  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({
      width: ICON_SIZE,
      height: ICON_SIZE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ palette: true, quality: 90, effort: 10 })
    .toFile(out);

  const meta = await sharp(out).metadata();
  console.log(
    `  rules icon.png       ink ${maxX - minX + 1}x${maxY - minY + 1}` +
      `  ->  rules-icon.png  ${meta.width}x${meta.height}  ` +
      `${kb((await stat(src)).size)} -> ${kb((await stat(out)).size)}`
  );
}

async function prepareCard() {
  const src = path.join(SRC_DIR, 'Rules pop up 1.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const isGold = (x, y) => {
    const i = (y * w + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r > 90 && r > b + 40 && g > b + 20;
  };
  const midY = Math.floor(h / 2);
  const midX = Math.floor(w / 2);
  let left = -1;
  let right = -1;
  let top = -1;
  let bottom = -1;
  for (let x = 0; x < w; x++) if (isGold(x, midY)) { left = x; break; }
  for (let x = w - 1; x >= 0; x--) if (isGold(x, midY)) { right = x; break; }
  for (let y = 0; y < h; y++) if (isGold(midX, y)) { top = y; break; }
  for (let y = h - 1; y >= 0; y--) if (isGold(midX, y)) { bottom = y; break; }
  if (left < 0 || top < 0) throw new Error(`${src}: could not find the card's gold border`);

  const out = path.join(CARD_OUT_DIR, 'rules-card.jpg');
  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize({ width: CARD_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: CARD_QUALITY, mozjpeg: true })
    .toFile(out);

  const meta = await sharp(out).metadata();
  console.log(
    `  Rules pop up 1.png   card ${right - left + 1}x${bottom - top + 1}` +
      `  ->  rules-card.jpg  ${meta.width}x${meta.height}  ratio ${(meta.width / meta.height).toFixed(3)}  ` +
      `${kb((await stat(src)).size)} -> ${kb((await stat(out)).size)}`
  );
}

async function main() {
  await mkdir(ICON_OUT_DIR, { recursive: true });
  await mkdir(CARD_OUT_DIR, { recursive: true });
  await prepareIcon();
  await prepareCard();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
