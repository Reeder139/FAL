// Prepares the "convert to paid" upsell cards shown over the League tab,
// from the source art in <repo>/Images/.
//
// Both sources are opaque rectangles that need cropping to the card itself.
// The first ships with 107px of dimmed app mockup down its left side —
// someone's screenshot of the popup in situ — which would render as a strip
// of fake UI inside the real one. The second is the card with a thin flat
// margin. Rather than hard-coding either, this finds the card's gold border
// and crops to it, which handles both and survives the art being re-exported
// at a different size.
//
// Output is JPEG, not PNG: these are photographic (fish, splashes, gradients)
// and fully opaque, so PNG costs several MB for no benefit. The corners
// outside the card's rounded gold border stay near-black, which is invisible
// against the scrim the card sits on.
//
// Run from mobile/:  node scripts/prepare-convert-prompts.mjs
// Requires sharp:    npm install --no-save sharp
//
// Not part of the build — the output is committed. Re-run only if the source
// art changes, and update CONVERT_PROMPTS in convert-prompt.tsx with the
// ratios printed below.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const SRC_DIR = path.resolve('..', 'Images');
const OUT_DIR = path.resolve('assets', 'images', 'convert');

const PROMPTS = [
  ['Convert to paid pop up.png', 'big-leagues.jpg'],
  ['convert to paid pop up 2.png', 'national-league.jpg'],
];

/** Widest the card is ever drawn is ~440px, so this is ~2.7x. Not enlarged
 * past the source card either way. */
const TARGET_WIDTH = 1200;
const QUALITY = 82;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function prepare(srcName, outName) {
  const src = path.join(SRC_DIR, srcName);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const isGold = (x, y) => {
    const i = (y * w + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r > 90 && r > b + 40 && g > b + 20;
  };

  // Scan through the middle of the card in both axes. The border is a closed
  // rounded rectangle, so a mid-height scan crosses its left and right edges
  // and a mid-width scan crosses top and bottom.
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
  if (left < 0 || top < 0 || right <= left || bottom <= top) {
    throw new Error(`${srcName}: could not find the card's gold border`);
  }

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  const out = path.join(OUT_DIR, outName);

  await sharp(data, { raw: { width: w, height: h, channels } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(out);

  const before = (await stat(src)).size;
  const after = (await stat(out)).size;
  const meta = await sharp(out).metadata();
  console.log(
    `  ${srcName.padEnd(30)} card ${cropW}x${cropH} (trimmed L${left} R${w - 1 - right} T${top} B${h - 1 - bottom})`
  );
  console.log(
    `  ${' '.repeat(30)} -> ${outName.padEnd(20)} ${meta.width}x${meta.height}  ratio ${(meta.width / meta.height).toFixed(3)}  ${kb(before)} -> ${kb(after)}`
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [srcName, outName] of PROMPTS) await prepare(srcName, outName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
